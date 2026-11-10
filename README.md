# BraveEasyFiles

Extensão para Brave (e outros navegadores Chromium) que replica o **Easy Files** do Opera GX: ao clicar em qualquer botão de anexar arquivo, aparece um painel com a imagem da área de transferência e os arquivos mais recentes, para anexar com um clique.

## Funcionalidades

- **Área de transferência:** mostra a imagem copiada (Win+Shift+S, Ctrl+C numa imagem).
- **Recentes:** os arquivos mais novos das pastas configuradas e do histórico de downloads do navegador, com miniaturas.
- Respeita o `accept` do site (se o site só aceita imagens, só aparecem imagens).
- **Ctrl+clique** seleciona vários arquivos quando o site permite.
- **Exibir todos os arquivos** ou **Shift+clique** no botão do site abre o seletor nativo do sistema.
- Funciona com inputs visíveis, `<label>` e inputs escondidos acionados por `input.click()` / `showPicker()`.

## Instalação

1. Abra `brave://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione esta pasta.
3. Em **Detalhes**, ative **Permitir acesso a URLs de arquivo** (necessário para listar os arquivos recentes).

## Configuração

Na engrenagem do painel (ou em Detalhes → Opções da extensão) dá para mudar:

- pastas monitoradas (uma por linha);
- quantidade máxima de arquivos;
- uso do histórico de downloads.

Por padrão são monitoradas `~\Downloads` e `~\Pictures\Screenshots`. O `~` é a pasta do seu usuário do Windows (`C:\Users\<você>`) e é detectado automaticamente, sem precisar configurar nada. Também dá para usar caminhos completos, como `D:\Prints`.

Os valores padrão ficam em `config.js`.

## Como funciona

| Arquivo | Papel |
| --- | --- |
| `main.js` | Roda no contexto da página e intercepta a abertura do seletor de arquivos. |
| `content.js` | Injeta o painel (iframe da extensão) e faz a ponte com `main.js`. |
| `picker.*` | Interface do painel: lista as pastas via `file://` e o histórico de downloads. |
| `background.js`, `offscreen.*` | Leem a imagem da área de transferência por um documento offscreen. |
| `options.*` | Página de configurações. |

## Limitações

- Só imagens da área de transferência; arquivos copiados no Explorer não ficam acessíveis ao navegador.
- Sites que usam a File System Access API (`showOpenFilePicker`) abrem o seletor nativo normalmente.
