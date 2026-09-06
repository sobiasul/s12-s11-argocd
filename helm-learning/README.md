# Helm Commands

This chart deploys nginx. The chart templates deliberately do not hardcode a
namespace; pass the namespace at deploy time or let Argo CD set it from the
Application destination.

## Validate The Chart

```bash
helm lint .
```

## Dev

Template:

```bash
helm template nginx . -f values-dev.yaml --namespace dev
```

Dry run:

```bash
helm upgrade --install nginx . -f values-dev.yaml --namespace dev --create-namespace --dry-run
```

Deploy:

```bash
helm upgrade --install nginx . -f values-dev.yaml --namespace dev --create-namespace
```

## Stg

Template:

```bash
helm template nginx . -f values-stg.yaml --namespace stg
```

Dry run:

```bash
helm upgrade --install nginx . -f values-stg.yaml --namespace stg --create-namespace --dry-run
```

Deploy:

```bash
helm upgrade --install nginx . -f values-stg.yaml --namespace stg --create-namespace
```

## Sandbox

Template:

```bash
helm template nginx . -f values-sandbox.yaml --namespace sandbox
```

Dry run:

```bash
helm upgrade --install nginx . -f values-sandbox.yaml --namespace sandbox --create-namespace --dry-run
```

Deploy:

```bash
helm upgrade --install nginx . -f values-sandbox.yaml --namespace sandbox --create-namespace
```

## Prod

Template:

```bash
helm template nginx . -f values-prod.yaml --namespace prod
```

Dry run:

```bash
helm upgrade --install nginx . -f values-prod.yaml --namespace prod --create-namespace --dry-run
```

Deploy:

```bash
helm upgrade --install nginx . -f values-prod.yaml --namespace prod --create-namespace
```
