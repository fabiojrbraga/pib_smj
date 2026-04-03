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
2. Opcional: clicar em `Importar OFX` para carregar o extrato bancario. O `FITID` da transacao sera salvo em `aux_extrato_fitid` e lancamentos ja importados serao ignorados.
3. Usar os combobox/lookups para:
   - `lan_idmem` (membro ativo)
   - `lan_lanope` (plano/tipo de operacao)
   - `lan_idmin` (ministerio)
4. Conferir as colunas auxiliares do extrato (`aux_extrato_desc`, `aux_extrato_dc`) e preencher `lan_deslan`.
5. Clicar em `Salvar na cadlan2`.
6. Conferir os dados.
7. Selecionar na grade as linhas ja salvas em `cadlan2` e clicar em `Confirmar selecionadas e enviar para cadlan` para copiar somente esse subconjunto mantendo a `cadlan2`.

## Estrutura preparada para expansao

Ja existe um catalogo/registro de tabelas em `src/modules/table-maintenance/tableRegistry.js` para permitir adicionar novas telas de manutencao futuramente sem alterar a base principal.

## IA generativa opcional

O preenchimento assistido por IA e totalmente opcional e nao interfere no fluxo tradicional da grid.

Para habilitar:

1. Defina `OPENAI_API_KEY`.
2. Defina `OPENAI_SYSTEM_PROMPT`.
3. Opcionalmente ajuste `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, `CADLAN2_AI_MAX_ROWS` e `CADLAN2_AI_MAX_EXAMPLES`.

Sem essas variaveis, o botao `Sugerir via IA` nao sera exibido na interface.
