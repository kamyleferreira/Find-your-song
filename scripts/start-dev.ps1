#!/usr/bin/env pwsh
<#
  start-dev.ps1
  - limpa o cache do Angular dev server e inicia o Ionic dev server com o proxy configurado
  Uso: npm run start:dev  (no Windows PowerShell)
#>

param()

$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host "[start-dev] Projeto raiz: $($PWD)"

if (Test-Path -Path '.angular\cache') {
  Write-Host "[start-dev] Removendo .angular/cache..."
  Remove-Item -LiteralPath '.angular\cache' -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "[start-dev] .angular/cache removido."
} else {
  Write-Host "[start-dev] .angular/cache não encontrado. Pulando remoção."
}

# A cache de otimização do Vite pode causar respostas "Outdated Optimize Dep" (504)
# quando dependências são atualizadas. Limpamos node_modules/.vite antes de iniciar
# para garantir que os chunks otimizados sejam regenerados na próxima execução.
if (Test-Path -Path 'node_modules/.vite') {
  Write-Host "[start-dev] Limpando node_modules/.vite..."
  Remove-Item -LiteralPath 'node_modules/.vite' -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "[start-dev] Cache do Vite removido."
} else {
  Write-Host "[start-dev] node_modules/.vite não encontrado. Pulando limpeza do Vite."
}

Write-Host "[start-dev] Iniciando ng serve com proxy (porta 8100)..."
# Usar diretamente ng serve evita o proxy extra do Ionic CLI, que vinha entregando
# HTML pré-cacheado com hashes antigos e gerando erros "Outdated Optimize Dep".
# O proxy da aplicação continua funcionando via proxy.conf.json.
npx ng serve --host "localhost" --port 8100 --configuration development --proxy-config proxy.conf.json
