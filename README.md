# PrintGlow - Sistema de Telemetria de Impressoras de Rede

Este é um sistema corporativo completo, moderno e de alta fidelidade para monitoramento em tempo real de ativos de impressão conectados na rede. O sistema conta com detecção de queda automática (pings periódicos), painel de volumetria física/lógica, gerador de relatórios portáteis, chimes sonoros de alerta e auditoria granular de eventos.

---

## 🚀 Funcionalidades Principais

*   **Dashboard Executivo**: Visibilidade imediata das métricas de saúde com gráficos interativos de latência por dispositivo (tempo de resposta do ping em milissegundos) e índice de saturação física.
*   **Gerenciamento Total**: Painel administrativo para novos registros com campos de IP, Hostname, Localização, Observações e Modelo específico do equipamento.
*   **Importação Inteligente de Planilhas**: Ingestão automática de pools de impressoras via arquivos **Excel (.xlsx)** ou arquivos de texto delimitados por vírgula/ponto-e-vírgula **(.csv)**.
*   **Monitoramento Ativo (Ping hibrido)**: Varredura de baixa latência baseada em sockets TCP em portas de impressão comuns (como 9100, 80, 515, 443) com fallback integrado para comandos de ping do sistema operacional.
*   **Chimes Auditivos Estilizados**: Chimes harmônicos suaves sintetizados diretamente pelo navegador via *AudioContext API* para alertas de incidentes (queda de cabo ou dispositivo inativo) e retornos operacionais online.
*   **Modo Demonstração Interativo**: Switch de bypass para avaliar imediatamente o sistema no painel sandbox com gráficos em flutuação autônoma em tempo real, sem necessidade de conectar bancos de dados externos.

---

## ✨ Como Configurar o Firebase

Para usufruir da persistência em nuvem multi-usuário e login administrativo do Google Auth:

1.  Acesse o [Console do Firebase](https://console.firebase.google.com/) e clique em **Adicionar Projeto**.
2.  Crie um banco de dados **Firestore** clicando em **Cloud Firestore** > **Criar Banco de Dados** em modo de produção.
3.  Vá em **Authentication** > **Sign-in Method** e ative o fornecedor de login **Google**.
4.  Substitua as chaves no arquivo `firebase-applet-config.json` localizado na raiz do projeto com as credenciais do seu Web App listadas abaixo das configurações gerais do projeto:
    ```json
    {
      "projectId": "SEU_PROJECT_ID",
      "appId": "SEU_APP_ID",
      "apiKey": "SUA_API_KEY",
      "authDomain": "SEU_AUTH_DOMAIN",
      "firestoreDatabaseId": "(default)",
      "storageBucket": "SEU_STORAGE_BUCKET",
      "messagingSenderId": "SEU_SENDER_ID"
    }
    ```
5.  Implante as regras de segurança Zero-Trust fornecidas no arquivo `firestore.rules` utilizando o Firebase CLI (`firebase deploy --only firestore:rules`).

---

## 📊 Como Importar Planilhas de Impressoras

O importador em lote mapeia colunas estruturadas para facilitar a transposição de dados históricos.

1. Prepare uma planilha no Excel ou Bloco de Notas com o seguinte cabeçalho (em minúsculo, sem acentos):
   ```csv
   nome,ip,hostname,localizacao,modelo,observações
   Impressora Recepcao,192.168.1.50,imp-rec,Recepção Térreo,HP LaserJet,Trocar toner no dia 15
   Plotter Engenharia,192.168.1.150,imp-plotter,Sala de Engenharia,Plotter HP,Uso exclusivo
   ```
2. No painel de **Impressoras** do app, clique em **Importar Planilha**.
3. Arraste e solte o arquivo `.xlsx` ou `.csv` na árear de upload.
4. Verifique a tabela de visualização prévia gerada instantaneamente e clique em **Confirmar Inclusão em Lote**. O upload para o banco de dados Firebase será finalizado em milissegundos.

---

## ☁️ Como Fazer Deploy no Vercel

O projeto foi meticulosamente estruturado para se adaptar a deploys de servidores serverless em nuvens híbridas:

1.  Instale a interface CLI global da Vercel: `npm install -g vercel`.
2.  No diretório raiz do projeto, vincule o repositório executando o comando `vercel`.
3.  Configure as seguintes Variáveis de Ambiente no painel da Vercel caso necessário para integrações adicionais:
    *   `NODE_ENV=production`
4.  Execute `vercel --prod` para compilar os ativos estáticos do Vite para o diretório `/dist` e habilitar o roteamento de API do servidor Express.

---

## 🛠️ Executando o Projeto Localmente

1. Instale as dependências fundamentais:
   ```bash
   npm install
   ```
2. Inicie o servidor integrado de desenvolvimento de pilha dupla (Porta 3000):
   ```bash
   npm run dev
   ```
3. Para compilar o pool de produção em CommonJS autocontido com o esbuild:
   ```bash
   npm run build
   ```
4. Suba o servidor otimizado compilado:
   ```bash
   npm run start
   ```
