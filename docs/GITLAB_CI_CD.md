# GitLab CI/CD Integration Guide

This guide explains how to set up automated builds and deployments of CloudCLI container images using GitLab CI/CD and GitLab Container Registry.

## Overview

The GitLab CI/CD workflow automatically:
- Builds gateway and worker container images
- Pushes them to GitLab Container Registry
- Tags releases appropriately
- Runs on every commit to `main` or `develop` branches
- Creates versioned releases from git tags

## Prerequisites

1. **GitLab Project**: Your CloudCLI repository hosted on GitLab
2. **GitLab Runner**: At least one runner with Docker executor enabled
3. **Container Registry**: Enabled for your GitLab project (Settings → General → Visibility)

## Setup

### 1. Enable GitLab CI/CD

The repository includes `.gitlab-ci.yml` which defines the pipeline. GitLab automatically detects this file.

### 2. Configure GitLab Runner

Ensure you have a GitLab Runner configured with the `docker` tag:

```yaml
# In .gitlab-ci.yml, jobs use:
tags:
  - docker
```

If you don't have a runner, see [GitLab's runner installation guide](https://docs.gitlab.com/runner/install/).

### 3. Environment Variables (Optional)

The pipeline uses GitLab's built-in CI/CD variables. No manual configuration needed:

| Variable | Source | Description |
|----------|--------|-------------|
| `CI_REGISTRY` | GitLab | Container registry URL |
| `CI_REGISTRY_IMAGE` | GitLab | Full image path |
| `CI_REGISTRY_USER` | GitLab | Registry username |
| `CI_REGISTRY_PASSWORD` | GitLab | Registry password (token) |
| `CI_COMMIT_SHORT_SHA` | GitLab | Commit SHA (short) |
| `CI_COMMIT_REF_SLUG` | GitLab | Branch/tag name (slugified) |

### 4. Container Registry Permissions

Ensure your project's Container Registry is accessible:

1. Go to **Settings → General → Visibility**
2. Scroll to **Container Registry**
3. Set visibility to at least "Only Project Members" or "Everyone"

## Pipeline Stages

### Stage 1: Build

Builds both gateway and worker images from Dockerfiles:

```yaml
build:gateway:
  stage: build
  script:
    - docker build -t $IMAGE_PATH/gateway:$CI_COMMIT_SHORT_SHA -f Dockerfile .
    - docker push $IMAGE_PATH/gateway:$CI_COMMIT_SHORT_SHA
```

Images are tagged with:
- Commit SHA: `registry.gitlab.com/your-org/cloudcli/gateway:abc1234`
- Branch name: `registry.gitlab.com/your-org/cloudcli/gateway:main`

### Stage 2: Push (Latest Tag)

On the `main` branch, images are also tagged as `latest`:

```yaml
push:latest:
  stage: push
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
```

### Stage 3: Release (Version Tags)

When you create a git tag like `v1.0.0`, images are tagged as:
- Version number: `registry.gitlab.com/your-org/cloudcli/gateway:1.0.0`
- Stable: `registry.gitlab.com/your-org/cloudcli/gateway:stable`

## Creating a Release

To create a new versioned release:

```bash
# Tag the commit
git tag -a v1.0.0 -m "Release version 1.0.0"

# Push the tag
git push origin v1.0.0

# GitLab CI/CD automatically:
# 1. Builds images
# 2. Tags as v1.0.0, 1.0.0, and stable
# 3. Pushes to Container Registry
```

## Manual Build and Push

For local development or testing, use the provided script:

```bash
# Build images locally
./scripts/build-and-push.sh v1.0.0

# Build and push in one step
./scripts/build-and-push.sh v1.0.0 --push
```

## Using Pre-built Images

After the pipeline runs, images are available at:

```
registry.gitlab.com/YOUR-USERNAME/YOUR-PROJECT/gateway:latest
registry.gitlab.com/YOUR-USERNAME/YOUR-PROJECT/worker:latest
```

### Pull Images

```bash
# Login to GitLab Container Registry
podman login registry.gitlab.com

# Pull images
podman pull registry.gitlab.com/YOUR-USERNAME/YOUR-PROJECT/gateway:latest
podman pull registry.gitlab.com/YOUR-USERNAME/YOUR-PROJECT/worker:latest
```

### Use in Docker Compose

Update your `docker-compose.gitlab.yml`:

```yaml
services:
  gateway:
    image: registry.gitlab.com/YOUR-USERNAME/YOUR-PROJECT/gateway:latest
    environment:
      - CONTAINER_BASE_IMAGE=registry.gitlab.com/YOUR-USERNAME/YOUR-PROJECT/worker:latest
```

## Personal Access Token

For pulling images from other machines, create a Personal Access Token:

1. Go to **Settings → Access Tokens** (in your GitLab user settings)
2. Create a new token with `read_registry` scope
3. Use the token as password when logging in:

```bash
podman login registry.gitlab.com
# Username: your-gitlab-username
# Password: glpat-xxxxxxxxxxxxxxxxxxxxx
```

## Deployment Workflow

**Recommended workflow for RHEL8/production:**

1. **Development** → Commit and push to `develop` branch
2. **Testing** → Images built automatically with `develop` tag
3. **Production** → Merge to `main` for `latest` tag
4. **Versioned Release** → Create git tag for stable release

```bash
# Development cycle
git checkout -b feature/my-feature
git commit -am "Add feature"
git push origin feature/my-feature

# After merge to main
git checkout main
git pull
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# Deploy on RHEL8
ssh rhel8-server
podman pull registry.gitlab.com/your-org/cloudcli/gateway:1.0.0
podman-compose -f docker-compose.gitlab.yml up -d
```

## Pipeline Configuration

### Customizing Build

Edit `.gitlab-ci.yml` to customize the pipeline:

**Add build arguments:**
```yaml
script:
  - docker build
      --build-arg NODE_VERSION=20
      -t $IMAGE_PATH/gateway:$CI_COMMIT_SHORT_SHA
      -f Dockerfile .
```

**Add tests:**
```yaml
test:
  stage: test
  script:
    - docker run --rm gateway-test npm test
```

**Add deployment stage:**
```yaml
deploy:production:
  stage: deploy
  script:
    - ssh user@rhel8-server 'cd /opt/cloudcli && docker-compose pull && docker-compose up -d'
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v[0-9]+\.[0-9]+\.[0-9]+$/'
```

### Multi-architecture Builds

To build for multiple architectures (amd64, arm64):

```yaml
build:gateway:
  script:
    - docker buildx create --use
    - docker buildx build
        --platform linux/amd64,linux/arm64
        -t $IMAGE_PATH/gateway:$CI_COMMIT_SHORT_SHA
        --push
        -f Dockerfile .
```

## Troubleshooting

### Pipeline Fails on Docker-in-Docker

If you see errors like "Cannot connect to Docker daemon":

1. Ensure your runner has Docker-in-Docker (dind) enabled
2. Check runner configuration has `privileged = true`
3. Verify the service is defined in `.gitlab-ci.yml`:
   ```yaml
   services:
     - docker:24-dind
   ```

### Registry Authentication Fails

If push fails with "unauthorized":

1. Check Container Registry is enabled for your project
2. Verify runner has access to `CI_REGISTRY_PASSWORD` variable
3. Ensure project visibility allows registry access

### Images Too Large

Optimize image sizes:

```dockerfile
# Use multi-stage builds
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-slim
COPY --from=builder /app/node_modules ./node_modules
COPY . .
```

### Build Timeout

For large builds that timeout:

```yaml
build:gateway:
  timeout: 2h
  script:
    - docker build --progress=plain ...
```

## Security Best Practices

1. **Use specific base image versions**: `FROM node:20-slim` not `FROM node`
2. **Scan images**: Add Trivy or similar scanner to pipeline
3. **Sign images**: Use cosign for image signing
4. **Minimize image size**: Use multi-stage builds and slim variants
5. **Keep secrets out of images**: Never COPY `.env` files

## Additional Resources

- [GitLab CI/CD Documentation](https://docs.gitlab.com/ee/ci/)
- [GitLab Container Registry](https://docs.gitlab.com/ee/user/packages/container_registry/)
- [Docker-in-Docker](https://docs.gitlab.com/ee/ci/docker/using_docker_build.html)
- [RHEL8 Deployment Guide](../DEPLOY_RHEL8.md)

## Support

For issues with the CI/CD pipeline:
- Check the pipeline logs in GitLab CI/CD → Pipelines
- Review runner logs: `gitlab-runner verify`
- Open an issue: https://github.com/siteboon/claudecodeui/issues
