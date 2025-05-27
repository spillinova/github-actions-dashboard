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
- A GitHub Personal Access Token (Classic) with the required scopes (see below)

## GitHub Personal Access Token Setup

### Token Type Recommendation

**Use a Classic GitHub Personal Access Token** (not a fine-grained token) for the best compatibility with this application. Fine-grained tokens have some limitations with the GitHub API that might affect functionality.

### Required Scopes

When creating your token, make sure to enable these scopes:

- `repo` (Full control of private repositories)
  - Required to access repository metadata and workflow information
  - Includes all `public_repo` and `repo:status` permissions
  - Enables access to both public and private repositories you have access to

- `workflow` (Update GitHub Action workflows)
  - Required to view workflow run information
  - Allows the dashboard to display workflow run status and details

### Steps to Generate a Classic PAT

1. Go to GitHub.com and sign in to your account
2. Click your profile photo in the top-right corner
3. Select **Settings**
4. In the left sidebar, click **Developer settings**
5. Click **Personal access tokens** > **Tokens (classic)**
6. Click **Generate new token** > **Generate new token (classic)**
7. Give your token a descriptive name (e.g., "GitHub Actions Dashboard")
8. Set an expiration (recommend: 90 days for security)
9. Under **Select scopes**, check:
   - [x] `repo` (Full control of private repositories)
   - [x] `workflow` (Update GitHub Action workflows)
10. Click **Generate token** at the bottom of the page
11. **Important**: Copy the token immediately - you won't be able to see it again!

### Security Best Practices

- Never commit your token to version control
- Store it securely using environment variables or a secrets manager
- Rotate your token periodically (every 60-90 days)
- Use the principle of least privilege - only grant necessary permissions
- Consider creating a dedicated GitHub account for the dashboard with limited repository access if needed

### Troubleshooting

If you see authentication errors:
- Double-check that you've selected the correct scopes
- Ensure you're using a Classic token (not fine-grained)
- Verify the token hasn't expired
- Check that the token has access to the specific repositories you're trying to monitor

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
   - `GH_PAT`: Your GitHub Personal Access Token (Classic) with `repo` and `workflow` scopes

4. **Push to main branch**
   The GitHub Actions workflow will automatically deploy the application to your VPS

5. **Access the dashboard**
   Open your browser and navigate to `http://your-vps-ip:8000`

## GitHub Actions Auto-Deployment

To set up automatic deployment to your VPS using GitHub Actions:

**Enable GitHub Actions**
   - The workflow file (`.github/workflows/deploy.yml`) is already included
   - Push to the `main` branch to trigger the deployment
   - The workflow will automatically use the `GH_PAT` secret you configured

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
| `GH_PAT` | GitHub Personal Access Token (Classic) with `repo` and `workflow` scopes. [Learn more](#github-personal-access-token-setup) | Yes | - |
| `HOST` | Host to bind the application to | No | 0.0.0.0 |
| `PORT` | Port to run the application on | No | 8000 |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
