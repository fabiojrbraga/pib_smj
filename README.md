# PIB SMJ - Manutencao `cadlan2`

Sistema web para preenchimento em grid da tabela `cadlan2`, com validacao e confirmacao em lote para envio na `cadlan`.

## 1) Configurar variavel de ambiente (Windows / PowerShell)

### Opcao recomendada (script pronto)
```powershell
.\scripts\set-db-env.ps1 -DatabaseUrl "mariadb://usuario:senha@host-remoto:3306/nome_banco"
```

### Opcao manual
```powershell
[System.Environment]::SetEnvironmentVariable(
  "DATABASE_URL",
  "mariadb://usuario:senha@host-remoto:3306/nome_banco",
  "User"
)
```

## 2) Instalar e executar

```powershell
npm install
npm run start
```

Abrir: `http://localhost:3000`

## Execucao com Docker

```powershell
docker build -t pib-smj:local .
docker run --rm -p 3000:3000 -e DATABASE_URL="mariadb://usuario:senha@host-remoto:3306/nome_banco" pib-smj:local
```

## Fluxo da tela

1. Preencher ou colar linhas na grade da `cadlan2`.
2. Opcional: clicar em `Importar OFX` para carregar o extrato bancario.
3. Usar os combobox/lookups para:
   - `lan_idmem` (membro ativo)
   - `lan_lanope` (plano/tipo de operacao)
   - `lan_idmin` (ministerio)
4. Conferir as colunas auxiliares do extrato (`aux_extrato_desc`, `aux_extrato_dc`) e preencher `lan_deslan`.
5. Clicar em `Salvar na cadlan2`.
6. Conferir os dados.
7. Clicar em `Confirmar e enviar para cadlan` para copiar tudo em lote e limpar a `cadlan2`.

## Estrutura preparada para expansao

Ja existe um catalogo/registro de tabelas em `src/modules/table-maintenance/tableRegistry.js` para permitir adicionar novas telas de manutencao futuramente sem alterar a base principal.
