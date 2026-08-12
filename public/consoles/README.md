# Fotos dos consoles (carrossel)

Coloque aqui uma foto por console, nomeada com o `system_id` (mesmo id usado em
`src/components/systemMeta.ts` e no banco):

```
public/consoles/snes.jpg
public/consoles/nes.jpg
public/consoles/psx.jpg
public/consoles/n64.jpg
public/consoles/gba.jpg
public/consoles/megadrive.jpg
public/consoles/arcade.jpg
```

Sem a foto de um console, o `ConsoleCarousel` cai sozinho pro fallback de cor
sólida (a cor de identidade daquele sistema, mesma usada no resto do app) —
não precisa preencher todas de uma vez.

Formato livre (`.jpg`/`.png`/`.webp`), mas recomenda-se algo próximo de 16:9
e não muito pesado (não tem otimização/compressão automática nessas imagens).

Esta pasta é ignorada pelo git (`.gitignore`) de propósito — a procedência das
fotos é do Bruno, não redistribuída pelo repositório.
