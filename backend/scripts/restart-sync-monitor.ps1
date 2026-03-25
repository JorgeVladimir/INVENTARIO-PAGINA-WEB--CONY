param(
	[int]$TimeoutMinutes = 30,
	[int]$PollSeconds = 5,
	[switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Info($message) {
	Write-Host "[INFO] $message" -ForegroundColor Cyan
}

function Write-Ok($message) {
	Write-Host "[OK]   $message" -ForegroundColor Green
}

function Write-WarnText($message) {
	Write-Host "[WARN] $message" -ForegroundColor Yellow
}

function Write-Err($message) {
	Write-Host "[ERR]  $message" -ForegroundColor Red
}

function Read-HttpErrorBody($exception) {
	try {
		if ($exception.ErrorDetails -and $exception.ErrorDetails.Message) {
			return [string]$exception.ErrorDetails.Message
		}

		if ($exception.Response -and $exception.Response.GetResponseStream()) {
			$reader = New-Object System.IO.StreamReader($exception.Response.GetResponseStream())
			return $reader.ReadToEnd()
		}
	} catch {
		return ""
	}
	return ""
}

$backendDir = Split-Path -Path $PSScriptRoot -Parent
$repoRoot = Split-Path -Path $backendDir -Parent

if (-not (Test-Path $backendDir)) {
	throw "No se encontró la carpeta backend. Ejecuta este script desde la estructura original del proyecto."
}

Push-Location $repoRoot

try {
	Write-Info "Paso 1/5: Detener procesos en el puerto 7002"
	$listenerPids = Get-NetTCPConnection -LocalPort 7002 -State Listen -ErrorAction SilentlyContinue |
		Select-Object -ExpandProperty OwningProcess -Unique

	if ($listenerPids) {
		foreach ($procId in $listenerPids) {
			Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
			Write-Ok "Proceso detenido: PID $procId"
		}
	} else {
		Write-Info "No había procesos escuchando en 7002"
	}

	if (-not $SkipBuild) {
		Write-Info "Paso 2/5: Compilar backend"
		npm --prefix backend run build
		Write-Ok "Compilación finalizada"
	} else {
		Write-WarnText "Paso 2/5: Build omitido por -SkipBuild"
	}

	Write-Info "Paso 3/5: Iniciar backend"
	$serverProcess = Start-Process -FilePath node -ArgumentList "dist/server.js" -WorkingDirectory $backendDir -PassThru
	Write-Ok "Backend iniciado con PID $($serverProcess.Id)"

	Write-Info "Paso 4/5: Esperar health"
	$healthOk = $false
	for ($i = 0; $i -lt 30; $i++) {
		try {
			$health = Invoke-RestMethod -Uri "http://127.0.0.1:7002/api/health" -Method Get -TimeoutSec 5
			if ($health.ok) {
				$healthOk = $true
				break
			}
		} catch {
			Start-Sleep -Seconds 1
		}
	}

	if (-not $healthOk) {
		throw "El backend no respondió en /api/health dentro de 30 segundos."
	}
	Write-Ok "Health operativo"

	Write-Info "Paso 5/5: Disparar sincronización SAP"
	$syncAlreadyRunning = $false
	$syncTriggered = $false
	try {
		# El endpoint de sync responde al finalizar; usamos timeout corto para disparar y seguir con monitor.
		$null = Invoke-WebRequest -Uri "http://127.0.0.1:7002/api/ecommerce/sap/sync" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 12
		$syncTriggered = $true
		Write-Ok "Sync disparada (respuesta temprana)"
	} catch {
		$errorBody = Read-HttpErrorBody $_.Exception
		$message = $_.Exception.Message

		if ($message -match "timed out" -or $message -match "expiró" -or $message -match "operation has timed out") {
			$syncTriggered = $true
			Write-Ok "Sync disparada. El request se cortó por timeout controlado; se continúa con monitor."
		} elseif ($errorBody -match "Ya hay una sincronización SAP en ejecución") {
			$syncAlreadyRunning = $true
			Write-WarnText "Ya existía una sync corriendo. Se monitoreará esa ejecución activa."
		} else {
			Write-Err "No se pudo iniciar la sincronización"
			if ($errorBody) {
				Write-Host $errorBody
			} else {
				Write-Host $_.Exception.Message
			}
			throw
		}
	}

	if ($syncTriggered -and -not $syncAlreadyRunning) {
		Write-Ok "Sync en ejecución. Monitoreando progreso..."
	}

	Write-Info "Monitoreo en vivo: /api/ecommerce/sap/sync-monitor"
	Write-Info "Leyenda: status (running/success/error), phase (etapa), progressPct (%), targetCount (filas en tabla destino)"

	$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
	while ((Get-Date) -lt $deadline) {
		try {
			$monitor = Invoke-RestMethod -Uri "http://127.0.0.1:7002/api/ecommerce/sap/sync-monitor" -Method Get -TimeoutSec 10
			$stamp = Get-Date -Format "HH:mm:ss"
			$line = "[$stamp] status=$($monitor.status) phase=$($monitor.phase) progress=$($monitor.progressPct)% fetched=$($monitor.totalFetched) processed=$($monitor.processed) synced=$($monitor.synced) batch=$($monitor.currentBatch)/$($monitor.totalBatches) targetCount=$($monitor.targetCount) lock=$($monitor.lockActive)"
			Write-Host $line

			if ($monitor.status -eq "success") {
				Write-Ok "Sincronización completada"
				exit 0
			}

			if ($monitor.status -eq "error") {
				Write-Err "Sincronización falló"
				if ($monitor.lastError) {
					Write-Host "Detalle: $($monitor.lastError)"
				}
				exit 1
			}
		} catch {
			Write-WarnText "No se pudo leer monitor temporalmente: $($_.Exception.Message)"
		}

		Start-Sleep -Seconds $PollSeconds
	}

	Write-WarnText "Tiempo agotado de monitoreo ($TimeoutMinutes minutos)."
	Write-WarnText "Puedes seguir viendo estado con: GET http://127.0.0.1:7002/api/ecommerce/sap/sync-monitor"
	if ($syncAlreadyRunning) {
		exit 2
	}
	exit 3
}
finally {
	Pop-Location
}
