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
    
    // Update the repositories list in the sidebar
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
    
    // Clear any existing content in the main container
    const container = document.getElementById('repo-container');
    if (container) {
        container.innerHTML = `
            <div class="text-center p-5 text-muted">
                <i class="bi bi-github" style="font-size: 3rem; opacity: 0.2;"></i>
                <h4 class="mt-3">Select a repository to view workflows</h4>
                <p class="mt-2">Use the sidebar to select a repository or add a new one.</p>
            </div>`;
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
    repos.forEach((repo, index) => {
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
            
            // Update active state
            document.querySelectorAll('#repoList .list-group-item').forEach(item => {
                item.classList.remove('active');
            });
            repoItem.classList.add('active');
            
            // Load workflows
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
        
        // Select the first repository by default
        if (index === 0) {
            repoItem.click();
        }
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
        // If no container is provided, try to find the main container
        if (!container) {
            container = document.getElementById('repo-container');
            if (!container) {
                console.error('Main container not found');
                return;
            }
        }
        
        // Create a unique ID for this repository's workflow container
        const workflowContainerId = `workflows-${owner}-${repo}`;
        
        // Check if we already have a workflow container for this repo
        let workflowContainer = document.getElementById(workflowContainerId);
        
        if (!workflowContainer) {
            // Create a new card for this repository
            const repoCard = document.createElement('div');
            repoCard.className = 'card mb-4';
            repoCard.id = `repo-${owner}-${repo}`;
            
            // Set up the card content
            repoCard.innerHTML = `
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">${owner}/${repo}</h5>
                    <div class="spinner-border spinner-border-sm" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
                <div class="card-body">
                    <div id="${workflowContainerId}" class="workflow-list">
                        Loading workflows...
                    </div>
                </div>
            `;
            
            // Add the card to the container
            container.appendChild(repoCard);
            workflowContainer = document.getElementById(workflowContainerId);
        }
        
        // Fetch workflows for this repository
        const response = await fetch(`/api/workflows/${owner}/${repo}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const workflows = data.workflows || [];
        
        // Get the workflow container again in case it was recreated
        const workflowList = document.getElementById(workflowContainerId);
        if (!workflowList) {
            console.error(`Workflow list container not found for ${owner}/${repo}`);
            return;
        }
        
        if (workflows.length === 0) {
            workflowList.innerHTML = '<p class="text-muted">No workflows found for this repository.</p>';
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

function showErrorInModal(message) {
    const errorElement = document.getElementById('repoError');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('d-none');
    }
}

function hideErrorInModal() {
    const errorElement = document.getElementById('repoError');
    if (errorElement) {
        errorElement.classList.add('d-none');
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
        showErrorInModal('Please provide both owner and repository name');
        return;
    }

    hideErrorInModal();

    // Disable form while processing
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    try {
        // Verify the repository exists and we have access to it
        const response = await fetch(`/api/workflows/${owner}/${repo}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Repository not found or access denied');
        }

        // Get or initialize the list of added repositories
        const savedRepos = getSavedRepos();

        // Check if repository is already added
        if (savedRepos.some(r => r.full_name.toLowerCase() === repoFullName.toLowerCase())) {
            throw new Error('This repository has already been added');
        }

        // Add the new repository
        const newRepo = { 
            owner: owner.toLowerCase(), 
            name: repo.toLowerCase(), 
            full_name: repoFullName.toLowerCase()
        };

        savedRepos.push(newRepo);
        localStorage.setItem('addedRepos', JSON.stringify(savedRepos));

        // Update the repositories list
        updateReposList(savedRepos);

        // Close the modal and reset the form
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
        showErrorInModal(error.message || 'Failed to add repository. Please verify the repository exists and you have access to it.');
    } finally {
        // Re-enable the form
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    }
}

// Set up the form submission
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('addRepoForm');
    if (form) {
        form.addEventListener('submit', handleAddRepo);
    }

    // Clear error when modal is hidden
    const modal = document.getElementById('addRepoModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', function() {
            hideErrorInModal();
            const form = document.getElementById('addRepoForm');
            if (form) form.reset();
        });
    }
});

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
