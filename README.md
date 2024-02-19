# Harvest

Harvest is a GitHub App that implements auto-scaling macOS and Linux runners using an underlying Orchard deployment. Harvest is self-hosted, so it's compatible with public GitHub, GitHub Cloud, and GitHub Enterprise Server. If you'd like to use a hosted solution, Cirrus Labs [offers one](https://cirrus-runners.app).

## Licensing

Using this project requires [Orchard](https://github.com/cirruslabs/orchard?tab=readme-ov-file#orchard) and [Tart](https://github.com/cirruslabs/tart?tab=readme-ov-file), which each have their own respective licenses. More information on these licenses can be found on the [Tart website](https://tart.run/licensing/).

This project is licensed under MIT.

## Quick Start

The following commands assume you have `bun` or `docker`, `orchard`, and `tart` installed, along with a GitHub app and supporting files configured with a `.env` file. See following Deployment section for more information.

Use `--help` for a detailed list of all options, flags, and environment configuration.

### Running a local build

The simplest way to run this project locally on arm macOS is to clone the repo and run:
```
bun run build
bun run dist/app.js --run-orchard-controller --run-orchard-worker
```

### Running the Docker image

Harvest is available as a Docker image at https://ghcr.io/randymarsh77/harvest.

The following command assumes you have a relative directory called `secrets` which includes your GitHub app private key and a `.env` file using `/volumes/secrets` as a base for your certificate files, you can run:

```
docker run -it \
  -v "$(pwd)/secrets:/volumes/secrets" \
  -v "#(pwd)/.orchard:/data/orchard/.orchard" \
  -e ENV_FILE_PATH=/volumes/secrets/.env \
  -p 6120:6120 \
  ghcr.io/randymarsh77/harvest:latest \
  --run-orchard-controller
```

You'll then need to [run at least one Orchard worker](#orchard-workers).

## Deployment

You will need:
- A GitHub app integration. You can [follow the guide](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) to register one.
  - Required permissions: `workflow_job`
- Somewhere to run Harvest
  - Harvest is published as a [Docker image](https://ghcr.io/randymarsh77/harvest). The image includes `orchard`, and can work with `--run-orchard-controller`. It does not currently include `tart`, and will not work with `--run-orchard-worker`.
  - Harvest is not currently available from any package managers, so you'll need to build and run the project if you aren't using the Docker image. See the [Quick Start](#quick-start) section.
- One or more machines to function as Orchard workers. Can be the same machine running Harvest and/or the Orchard controller.

### GitHub App

Harvest requires the following environmental configuration in order to run as your GitHub app:

```
# Your GitHub app ID
APP_ID="123456"

# Your GitHub app's webhook secret
WEBHOOK_SECRET="abc123"

# Path to the private key for your GitHub app.
PRIVATE_KEY_PATH="/volumes/secrets/private-key.pem"
```

#### Smee

Note that the GitHub app development guide uses https://smee.io to forward webhook deliveries for local development. Harvest supports this model using `SMEE_URL`.

### Orchard

By default, Harvest will assume an external Orchard deployment accessible at `ORCHARD_URL`, and defaults to `https://localhost:6120`. Using an external Orchard deployment enables independent redeployment of the GitHub app without disruptions to the Orchard cluster. However, the Orchard cluster is resilient to connection disruptions between controller/worker. So, if your security model permits, it might be easier to have Harvest manage the Orchard controller, which it will do when passed `--run-orchard-controller`.

### Orchard Controller

By default, Harvest will NOT start and manage an Orchard controller, but you can use `--run-orchard-controller` if you don't have a separate / external Orchard deployment.

You can provide a certificate for the managed controller as well as a persistent data directory and a bootstrap-admin token. Use `--help` for detailed information on available environment variables to integrate with Orchard.

### Orchard Workers

By default, Harvest will NOT run any Orchard workers. However, you can use `--run-orchard-worker` to have boot a worker process that connects to your controller. This flag requires the controller to also be managed with `--run-orchard-controller`.

Otherwise, start Orchard workers [normally](https://github.com/cirruslabs/orchard/blob/main/DeploymentGuide.md#configuring-orchard-workers).

For example:
```
orchard context create --name production --service-account-name bootstrap-admin --service-account-token "$ORCHARD_BOOTSTRAP_ADMIN_TOKEN" https://localhost:6120
orchard context default production
orchard worker run https://localhost:6120 --bootstrap-token $(orchard get bootstrap-token bootstrap-admin)
```
