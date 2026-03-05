param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

if (-not ($DatabaseUrl -match "^(mariadb|mysql)://")) {
  Write-Error "DATABASE_URL invalida. Use: mariadb://usuario:senha@host:porta/banco"
  exit 1
}

[System.Environment]::SetEnvironmentVariable("DATABASE_URL", $DatabaseUrl, "User")
$env:DATABASE_URL = $DatabaseUrl

Write-Output "DATABASE_URL definida no escopo do usuario e da sessao atual."
