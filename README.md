# GitHub Actions Dashboard

A web application that monitors GitHub Actions workflows across your repositories. Built with FastAPI, Alpine Linux, and Docker.

## Features

- View workflow runs across all your repositories in one place
- Real-time status updates
- Simple and intuitive UI
- Lightweight and containerized with Docker
- Easy deployment to any VPS

## Prerequisites

- Docker and Docker Compose installed on your VPS
- A GitHub Personal Access Token with `repo` and `workflow` scopes

## Quick Start

1. **Create a new GitHub repository** and push this code to it

2. **Set up your VPS**
   - Install Docker and Docker Compose
   - Create a new user with sudo privileges (if not already done)
   - Set up SSH key authentication for the new user

3. **Configure GitHub repository secrets**
   Go to your repository Settings > Secrets > Actions and add:
   - `VPS_HOST`: Your VPS IP address or domain
   - `VPS_USER`: SSH username (e.g., `deploy`)
   - `VPS_SSH_KEY`: The private SSH key that matches the public key on your VPS
   - `VPS_DEPLOY_PATH`: Path where the app will be deployed (e.g., `/root/github-actions-dashboard`)
   - `GH_PAT`: GitHub Personal Access Token with `repo` and `workflow` scopes (Note: The secret name must not start with 'GITHUB_')

4. **Push to main branch**
   The GitHub Actions workflow will automatically deploy the application to your VPS

5. **Access the dashboard**
   Open your browser and navigate to `http://your-vps-ip:8000`

## GitHub Actions Auto-Deployment

To set up automatic deployment to your VPS using GitHub Actions:

1. **Add secrets to your GitHub repository**
   - Go to your repository settings > Secrets > Actions
   - Add the following secrets:
     - `VPS_HOST`: Your VPS IP address or domain
     - `VPS_USER`: SSH username for your VPS
     - `VPS_SSH_KEY`: Private SSH key with access to your VPS
     - `VPS_DEPLOY_PATH`: Path on your VPS where the app will be deployed (e.g., `/opt/github-actions-dashboard`)
     - `GITHUB_TOKEN`: Your GitHub token with `repo` and `workflow` scopes

2. **Enable GitHub Actions**
   - The workflow file (`.github/workflows/deploy.yml`) is already included
   - Push to the `main` branch to trigger the deployment

## Manual Deployment (Alternative)

If you need to deploy manually or debug issues:

1. **SSH into your VPS**
   ```bash
   ssh user@your-vps-ip
   ```

2. **Navigate to deployment directory**
   ```bash
   cd /opt/github-actions-dashboard  # or your chosen VPS_DEPLOY_PATH
   ```

3. **View logs**
   ```bash
   docker-compose logs -f
   ```

4. **Restart the application**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

## Updating

To update to the latest version:

```bash
git pull origin main
docker-compose up -d --build
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token with `repo` and `workflow` scopes | Yes | - |
| `HOST` | Host to bind the application to | No | 0.0.0.0 |
| `PORT` | Port to run the application on | No | 8000 |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
