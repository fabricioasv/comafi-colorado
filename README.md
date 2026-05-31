# COMAFI Colorado

Site estatico mobile-first para acompanhar despesas, depositos e saldos da obra COMAFI Colorado.

## Fluxo simplificado

1. Gere o JSON localmente a partir da planilha:

```bash
npm run data:build -- "C:\caminho\CONTROLE CONTAS A PAGAR 2024 COMAFI.xlsx"
```

2. O comando grava:

```txt
public/data.json
```

3. Gere o front estatico:

```bash
npm run build
```

4. Publique o conteudo gerado em `dist/` no Azure Static Web Apps.

## Scripts

```bash
npm install
npm run data:build -- caminho-da-planilha.xlsx
npm run build
npm run dev
```

## Observacoes

- Nao ha backend, Function, Blob Storage ou token de publicacao.
- O front le somente `/data.json`.
- Para atualizar os dados, rode novamente `npm run data:build -- caminho.xlsx`, faca build e publique.
- O parser aceita `.xlsx` e `.csv`.
