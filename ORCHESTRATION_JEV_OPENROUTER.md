# Universal Chat : orchestration Jev et OpenRouter

## Rôle de Jev

Jev (`jev-latest`) n’est pas ajouté comme modèle conversationnel. En mode
`Auto`, Orca peut lui demander de choisir un candidat parmi les providers et
modèles déjà actifs dans le pool. Les providers et modèles désactivés ne sont
jamais envoyés à Jev.

Le routage est facultatif et ne nécessite aucun serveur local :

```sh
export TYPESAFE_API_KEY="..."
export TYPESAFE_AUTO_ROUTING=1
ORCA_BACKGROUND_LAUNCH=1 pnpm dev
```

Sans clé TypeSafe, avec `TYPESAFE_AUTO_ROUTING=0`, en cas d’erreur réseau ou si
la confiance est inférieure à 0,5, Orca utilise immédiatement son classement
Auto local. L’orchestration fonctionne donc toujours sans LLM décisionnel.

## OpenRouter

OpenRouter reste un provider de modèles LLM piloté par OpenCode, et non un
agent TUI supplémentaire. OpenCode le supporte nativement : utilisez
`/connect` dans OpenCode ou fournissez `OPENROUTER_API_KEY` à son environnement.
Les modèles apparaissent ensuite dans le catalogue OpenCode avec leur
identifiant `openrouter/...` et deviennent disponibles dans le Chat universel
selon les réglages d’activation d’Orca.

La session reste donc créée par OpenCode, qui conserve la gestion de
l’authentification, du catalogue et du transport OpenRouter.
