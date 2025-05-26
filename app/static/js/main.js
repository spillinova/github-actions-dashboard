// Main JavaScript for GitHub Actions Dashboard

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the dashboard
    initializeDashboard();
    
    // Set up auto-refresh every 30 seconds
    setInterval(loadRepositories, 30000);
    
    // Set up form submission
    const repoForm = document.getElementById('add-repo-form');
    if (repoForm) {
        repoForm.addEventListener('submit', handleAddRepo);
    }
});

async function initializeDashboard() {
    // Load any previously added repositories from localStorage
    const savedRepos = getSavedRepos();
    updateReposList(savedRepos);
    
    // Set up refresh button
    const refreshBtn = document.getElementById('refreshRepos');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            const savedRepos = getSavedRepos();
            const container = document.getElementById('repo-container');
            if (container) {
                container.innerHTML = '';
                for (const repo of savedRepos) {
                    await loadWorkflows(repo.owner, repo.name, container);
                }
            }
        });
    }
    
    // Load the first repository if available
    if (savedRepos.length > 0) {
        const container = document.getElementById('repo-container');
        if (container) {
            container.innerHTML = '';
            await loadWorkflows(savedRepos[0].owner, savedRepos[0].name, container);
        }
    }
}

async function loadRepositories() {
    try {
        const response = await fetch('/api/repos');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const repos = data.repos || [];
        
        const container = document.getElementById('repoList');
        const noReposMessage = document.getElementById('noReposMessage');
        
        if (!container || !noReposMessage) {
            console.error('Required elements not found in the DOM');
            return;
        }
        
        if (repos.length === 0) {
            noReposMessage.textContent = 'No repositories found. Make sure your GitHub token has the correct permissions.';
            return;
        }
        
        // Clear loading state
        container.innerHTML = '';
        
        // Load each repository's workflows
        for (const repo of repos) {
            await loadWorkflows(repo.owner, repo.name, container);
        }
    } catch (error) {
        console.error('Error loading repositories:', error);
        showError('Failed to load repositories. Please try again later.');
    }
}

function getSavedRepos() {
    return JSON.parse(localStorage.getItem('addedRepos') || '[]');
}

function updateReposList(repos) {
    const repoList = document.getElementById('repoList');
    const noReposMessage = document.getElementById('noReposMessage');
    
    if (!repoList) return;
    
    // Clear the current list
    repoList.innerHTML = '';
    
    if (repos.length === 0) {
        noReposMessage.style.display = 'block';
        return;
    }
    
    noReposMessage.style.display = 'none';
    
    // Add each repository to the list
    repos.forEach(repo => {
        const repoItem = document.createElement('button');
        repoItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
        repoItem.innerHTML = `
            <span>${repo.full_name}</span>
            <button class="btn btn-sm btn-outline-danger remove-repo" data-owner="${repo.owner}" data-repo="${repo.name}">
                <i class="bi bi-trash"></i>
            </button>
        `;
        
        // Add click handler to load workflows
        repoItem.addEventListener('click', async (e) => {
            // Don't navigate if the remove button was clicked
            if (e.target.closest('.remove-repo')) return;
            
            const container = document.getElementById('repo-container');
            if (container) {
                container.innerHTML = '';
                await loadWorkflows(repo.owner, repo.name, container);
            }
        });
        
        // Add remove button handler
        const removeBtn = repoItem.querySelector('.remove-repo');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeRepository(repo.owner, repo.name);
            });
        }
        
        repoList.appendChild(repoItem);
    });
}

function removeRepository(owner, repoName) {
    const savedRepos = getSavedRepos();
    const updatedRepos = savedRepos.filter(r => !(r.owner === owner && r.name === repoName));
    
    if (updatedRepos.length !== savedRepos.length) {
        localStorage.setItem('addedRepos', JSON.stringify(updatedRepos));
        updateReposList(updatedRepos);
        
        // If we're currently viewing this repo, clear the container
        const container = document.getElementById('repo-container');
        if (container) {
            container.innerHTML = '';
        }
    }
}

async function loadWorkflows(owner, repo, container) {
    try {
        const repoElement = document.createElement('div');
        repoElement.className = 'repo-card';
        repoElement.id = `repo-${owner}-${repo}`;
        repoElement.innerHTML = `
            <div class="repo-header">
                <h3 class="repo-name">${owner}/${repo}</h3>
                <span class="spinner"></span>
            </div>
            <div class="workflow-list" id="workflows-${owner}-${repo}">
                <p>Loading workflows...</p>
            </div>`;
        
        container.appendChild(repoElement);
        
        // Fetch workflows for this repository
        const response = await fetch(`/api/workflows/${owner}/${repo}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const workflows = data.workflows || [];
        
        const workflowList = document.getElementById(`workflows-${owner}-${repo}`);
        if (!workflowList) {
            console.error(`Workflow list container not found for ${owner}/${repo}`);
            return;
        }
        
        if (workflows.length === 0) {
            workflowList.innerHTML = '<p>No workflows found for this repository.</p>';
            return;
        }
        
        workflowList.innerHTML = '';
        
        // Load workflow runs for each workflow
        for (const workflow of workflows) {
            await loadWorkflowRuns(owner, repo, workflow.id, workflow.name, workflowList);
        }
        
        // Remove spinner once loaded
        const spinner = repoElement.querySelector('.spinner');
        if (spinner) {
            spinner.remove();
        }
    } catch (error) {
        console.error(`Error loading workflows for ${owner}/${repo}:`, error);
        const workflowList = document.getElementById(`workflows-${owner}-${repo}`);
        if (workflowList) {
            workflowList.innerHTML = '<p class="error">Failed to load workflows. Please try again later.</p>';
        }
    }
}

async function loadWorkflowRuns(owner, repo, workflowId, workflowName, container) {
    try {
        const response = await fetch(`/api/runs/${owner}/${repo}/${workflowId}?per_page=3`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const runs = data.runs || [];
        
        if (!runs || runs.length === 0) {
            const workflowElement = document.createElement('div');
            workflowElement.className = 'workflow-item';
            workflowElement.innerHTML = `
                <div class="workflow-header">
                    <span class="workflow-name">${workflowName}</span>
                    <span class="workflow-status">No runs</span>
                </div>`;
            container.appendChild(workflowElement);
            return;
        }
        
        // Get the most recent run
        const latestRun = runs[0];
        const status = latestRun.conclusion || latestRun.status;
        
        const workflowElement = document.createElement('div');
        workflowElement.className = `workflow-item ${status}`;
        workflowElement.innerHTML = `
            <div class="workflow-header">
                <span class="workflow-name">${workflowName}</span>
                <span class="workflow-status ${status}">${status || 'in progress'}</span>
            </div>
            <div class="workflow-details">
                <div>Branch: ${latestRun.head_branch || 'main'}</div>
                <div>Commit: ${latestRun.head_commit?.message?.split('\n')[0] || 'N/A'}</div>
                <div>Run by: ${latestRun.actor?.login || 'N/A'}</div>
                <div>Last run: ${formatDate(latestRun.created_at)}</div>
            </div>`;
        
        container.appendChild(workflowElement);
    } catch (error) {
        console.error(`Error loading workflow runs for ${owner}/${repo}/${workflowId}:`, error);
    }
}

async function handleAddRepo(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const owner = formData.get('owner').trim();
    const repo = formData.get('repo').trim();
    const repoFullName = `${owner}/${repo}`;
    
    if (!owner || !repo) {
        showError('Please provide both owner and repository name');
        return;
    }
    
    try {
        // Verify the repository exists and we have access to it
        const response = await fetch(`/api/workflows/${owner}/${repo}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Repository not found or access denied');
        }
        
        // Get or initialize the list of added repositories
        const savedRepos = JSON.parse(localStorage.getItem('addedRepos') || '[]');
        
        // Check if repository is already added
        if (savedRepos.some(r => r.full_name === repoFullName)) {
            showError('This repository has already been added');
            return;
        }
        
        // Add the new repository
        const newRepo = { owner, name: repo, full_name: repoFullName };
        savedRepos.push(newRepo);
        localStorage.setItem('addedRepos', JSON.stringify(savedRepos));
        
        // Update the repositories list
        updateReposList(savedRepos);
        
        // Close the modal and clear the form
        const modal = bootstrap.Modal.getInstance(document.getElementById('addRepoModal'));
        if (modal) {
            modal.hide();
        }
        form.reset();
        
        // Clear and update the display
        const container = document.getElementById('repo-container');
        if (container) {
            container.innerHTML = '';
            await loadWorkflows(owner, repo, container);
        }
        
    } catch (error) {
        console.error('Error adding repository:', error);
        showError(error.message || 'Failed to add repository. Please verify the repository exists and you have access to it.');
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    }).format(date);
}

function showError(message) {
    // Check if error message already exists
    let errorElement = document.getElementById('error-message');
    
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'error-message';
        errorElement.className = 'error-message';
        errorElement.style.color = '#d73a49';
        errorElement.style.marginTop = '10px';
        errorElement.style.padding = '10px';
        errorElement.style.borderRadius = '4px';
        errorElement.style.backgroundColor = '#ffebee';
        
        const form = document.getElementById('add-repo-form');
        if (form) {
            form.appendChild(errorElement);
        } else {
            document.body.prepend(errorElement);
        }
    }
    
    errorElement.textContent = message;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadRepositories,
        loadWorkflows,
        loadWorkflowRuns,
        formatDate
    };
}
