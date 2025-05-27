// Main JavaScript for GitHub Actions Dashboard

// Debounce function to limit API calls during search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Function to load the user's repositories
async function loadMyRepos() {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;
    
    // Show loading state
    resultsContainer.innerHTML = `
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 mb-0">Loading your repositories...</p>
        </div>`;
    
    try {
        // Get the user's repositories
        const response = await fetch('/api/my-repos');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const repos = data.items || [];
        
        if (repos.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center p-4 text-muted">
                    <i class="bi bi-inbox" style="font-size: 2rem; opacity: 0.5;"></i>
                    <p class="mt-2 mb-0">No repositories found in your account</p>
                </div>`;
            return;
        }
        
        // Display repositories
        renderRepositories(repos, 'Your repositories');
        
    } catch (error) {
        console.error('Error loading repositories:', error);
        resultsContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                Failed to load your repositories. Please try again later.
            </div>`;
    }
}

// Function to render repositories in the results container
function renderRepositories(repos, title) {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;
    
    const savedRepos = getSavedRepos();
    
    let html = `
        <div class="sticky-top bg-white py-2 border-bottom">
            <div class="d-flex justify-content-between align-items-center">
                <h6 class="mb-0">${title}</h6>
                <small class="text-muted">${repos.length} repositories</small>
            </div>
        </div>`;
    
    if (repos.length === 0) {
        html += `
            <div class="text-center p-4 text-muted">
                <i class="bi bi-inbox" style="font-size: 2rem; opacity: 0.5;"></i>
                <p class="mt-2 mb-0">No repositories found</p>
            </div>`;
    } else {
        // Sort repositories with private ones first, then by name
        const sortedRepos = [...repos].sort((a, b) => {
            if (a.private !== b.private) {
                return b.private - a.private; // Private repos first
            }
            return a.name.localeCompare(b.name); // Then sort by name
        });

        sortedRepos.forEach(repo => {
            const isPrivate = repo.private || false;
            const ownerLogin = repo.owner?.login || 'unknown';
            const repoName = repo.name || 'unknown';
            const isAdded = savedRepos.some(r => 
                r.owner === ownerLogin && r.name === repoName
            );
            
            // Format the updated_at date safely
            let updatedAt = 'Unknown';
            try {
                updatedAt = repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : 'Unknown';
            } catch (e) {
                console.warn('Invalid date format for repo:', repoName, e);
            }
            
            html += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1 me-3">
                        <div class="d-flex align-items-center">
                            <h6 class="mb-0">
                                ${isPrivate ? '<i class="bi bi-lock-fill text-warning me-1" title="Private repository"></i>' : ''}
                                <a href="${repo.html_url || '#'}" target="_blank" class="text-decoration-none text-dark">
                                    ${repoName}
                                </a>
                                <small class="text-muted ms-2">${ownerLogin}</small>
                            </h6>
                        </div>
                        ${repo.description ? `<p class="mb-1 small text-muted text-truncate">${repo.description}</p>` : ''}
                        <div class="d-flex flex-wrap gap-2 align-items-center mt-1">
                            ${repo.language ? `<span class="badge bg-light text-dark">${repo.language}</span>` : ''}
                            <span class="badge bg-light text-dark">
                                <i class="bi bi-star-fill text-warning"></i> ${repo.stargazers_count?.toLocaleString() || 0}
                            </span>
                            <span class="badge bg-light text-dark">
                                <i class="bi bi-git"></i> ${repo.forks_count?.toLocaleString() || 0}
                            </span>
                            <span class="text-muted small">
                                <i class="bi bi-clock-history"></i> Updated ${updatedAt}
                            </span>
                            ${repo.default_branch ? `
                                <span class="badge bg-light text-dark" title="Default branch">
                                    <i class="bi bi-git-branch"></i> ${repo.default_branch}
                                </span>` : 
                                `<span class="badge bg-light text-dark" title="Branch information not available">
                                    <i class="bi bi-git-branch"></i> Branch: N/A
                                </span>`
                            }
                        </div>
                    </div>
                    <button class="btn btn-sm ${isAdded ? 'btn-outline-secondary' : 'btn-primary'} add-repo" 
                            data-owner="${ownerLogin}" 
                            data-repo="${repoName}"
                            ${isAdded ? 'disabled' : ''}
                            title="${isAdded ? 'Already added' : 'Add to dashboard'}">
                        ${isAdded ? 'Added' : 'Add'}
                    </button>
                </div>`;
        });
    }
    
    resultsContainer.innerHTML = html;
    
    // Add event listeners to the Add buttons
    document.querySelectorAll('.add-repo').forEach(button => {
        button.addEventListener('click', handleAddRepo);
    });
}

// Configuration
const POLLING_INTERVAL = 60000; // 1 minute

// Global variables
let pollingIntervalId = null;
let isPolling = false;

// Initialize polling
function startPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
    }
    
    const refreshBtn = document.getElementById('refreshRepos');
    if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
        refreshBtn.title = 'Refresh now';
    }
    
    pollingIntervalId = setInterval(async () => {
        await refreshAllWorkflows(true);
    }, POLLING_INTERVAL);
    
    isPolling = true;
    console.log('Auto-refresh started');
}

// Stop polling
function stopPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
    isPolling = false;
    console.log('Auto-refresh stopped');
}

// Toggle polling
function togglePolling() {
    if (isPolling) {
        stopPolling();
    } else {
        startPolling();
    }
    updatePollingButton();
}

// Update the polling button state
function updatePollingButton() {
    const refreshBtn = document.getElementById('refreshRepos');
    if (!refreshBtn) return;
    
    if (isPolling) {
        refreshBtn.classList.add('polling-active');
        refreshBtn.title = 'Auto-refresh enabled (click to disable)';
    } else {
        refreshBtn.classList.remove('polling-active');
        refreshBtn.title = 'Auto-refresh disabled (click to enable)';
    }
}

// Refresh all workflows
async function refreshAllWorkflows(silent = false) {
    const refreshBtn = document.getElementById('refreshRepos');
    if (!refreshBtn) return;
    
    // Don't refresh if already refreshing
    if (refreshBtn.classList.contains('refreshing')) {
        return;
    }
    
    // Show refreshing state
    refreshBtn.classList.add('refreshing');
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    
    try {
        const savedRepos = getSavedRepos();
        const container = document.getElementById('repo-container');
        
        if (container && savedRepos.length > 0) {
            // Only clear if not silent (initial load)
            if (!silent) {
                container.innerHTML = '';
            }
            
            // Refresh each repository
            for (const repo of savedRepos) {
                await loadWorkflows(repo.owner, repo.name, container);
            }
            
            if (!silent) {
                console.log('Workflows refreshed successfully');
            }
        }
    } catch (error) {
        console.error('Error refreshing workflows:', error);
    } finally {
        // Reset button state after a short delay to show the spinner
        setTimeout(() => {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="bi-arrow-clockwise"></i>';
                refreshBtn.classList.remove('refreshing');
                updatePollingButton();
            }
        }, 500);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the dashboard
    initializeDashboard();
    
    // Set up repository search
    const repoSearch = document.getElementById('repoSearch');
    if (repoSearch) {
        repoSearch.addEventListener('input', debounce(handleRepoSearch, 500));
    }
    
    // Set up refresh button
    const refreshBtn = document.getElementById('refreshRepos');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await refreshAllWorkflows();
        });
        
        // Add right-click to toggle auto-refresh
        refreshBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            togglePolling();
            return false;
        });
    }
    
    // Load repositories when modal is shown
    const addRepoModal = document.getElementById('addRepoModal');
    if (addRepoModal) {
        addRepoModal.addEventListener('shown.bs.modal', () => {
            loadMyRepos();
            const searchInput = addRepoModal.querySelector('input[type="text"]');
            if (searchInput) {
                searchInput.focus();
            }
        });
    }
    
    // Start polling when the page loads
    startPolling();
});

async function initializeDashboard() {
    // Load any previously added repositories from localStorage
    const savedRepos = getSavedRepos();
    
    // Only proceed if we have a valid repository list container
    const repoList = document.getElementById('repoList');
    if (!repoList) {
        console.warn('Repository list container not found');
        return;
    }
    
    // Update the repositories list in the sidebar
    updateReposList(savedRepos);
    
    // Set up refresh button if it exists
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
    // This function is intentionally left empty as we don't want to load all repositories
    // Repositories are only loaded when explicitly added through the UI
    return [];
}

function getSavedRepos() {
    return JSON.parse(localStorage.getItem('addedRepos') || '[]');
}

function updateReposList(repos) {
    const repoList = document.getElementById('repoList');
    const noReposMessage = document.getElementById('noReposMessage');
    const container = document.getElementById('repo-container');
    
    if (!repoList) return;
    
    // Store the currently selected repo if any
    const activeItem = repoList.querySelector('.active');
    const activeRepoId = activeItem ? activeItem.dataset.repoId : null;
    
    // Clear the current list
    repoList.innerHTML = '';
    
    if (repos.length === 0) {
        noReposMessage.style.display = 'block';
        if (container) container.innerHTML = '';
        return;
    }
    
    noReposMessage.style.display = 'none';
    
    // Add each repository to the list
    repos.forEach((repo, index) => {
        const repoId = `${repo.owner}_${repo.name}`.replace(/[^a-zA-Z0-9-_]/g, '_');
        const isActive = activeRepoId === repoId || (index === 0 && !activeRepoId);
        
        const repoItem = document.createElement('button');
        repoItem.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isActive ? 'active' : ''}`;
        repoItem.dataset.repoId = repoId;
        repoItem.dataset.owner = repo.owner;
        repoItem.dataset.repo = repo.name;
        repoItem.innerHTML = `
            <span>${repo.full_name}</span>
            <button class="btn btn-sm btn-outline-danger remove-repo" data-owner="${repo.owner}" data-repo="${repo.name}">
                <i class="bi bi-trash"></i>
            </button>
        `;
        
        // Add click handler to load workflows
        const clickHandler = async (e) => {
            // Don't navigate if the remove button was clicked
            if (e.target.closest('.remove-repo')) return;
            
            // Skip if already active
            if (repoItem.classList.contains('active')) return;
            
            // Update active state
            document.querySelectorAll('#repoList .list-group-item').forEach(item => {
                item.classList.remove('active');
            });
            repoItem.classList.add('active');
            
            // Load workflows
            if (container) {
                container.innerHTML = '';
                await loadWorkflows(repo.owner, repo.name, container);
            }
        };
        
        // Add the item to the list
        repoList.appendChild(repoItem);
        
        // Add click handler to the new item
        const addedItem = repoList.lastElementChild;
        if (addedItem) {
            addedItem.addEventListener('click', clickHandler);
            
            // Add remove button handler if it exists
            const removeBtn = addedItem.querySelector('.remove-repo');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeRepository(repo.owner, repo.name);
                });
            }
        }
        
        // If this is the active repo, load its workflows
        if (isActive && container) {
            container.innerHTML = '';
            loadWorkflows(repo.owner, repo.name, container);
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
        const repoCard = document.getElementById(`repo-${owner}-${repo}`);
        if (repoCard) {
            const spinner = repoCard.querySelector('.spinner');
            if (spinner) {
                spinner.remove();
            }
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
        console.log(`Workflow runs for ${owner}/${repo}/${workflowId}:`, data); // Debug log
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
        const status = latestRun.conclusion || latestRun.status || 'unknown';
        const statusText = status === 'completed' ? 'success' : status === 'in_progress' ? 'in progress' : status;
        
        // Get branch information - try different possible locations
        let branchName = 'Not specified';
        if (latestRun.head_branch) {
            branchName = latestRun.head_branch;
        } else if (latestRun.head_repository?.full_name) {
            // Try to extract branch from head repository name if available
            const match = latestRun.head_repository.full_name.match(/[^/]+$/);
            if (match) branchName = match[0];
        }
        
        const workflowElement = document.createElement('div');
        workflowElement.className = `workflow-item ${status}`;
        workflowElement.innerHTML = `
            <div class="workflow-header">
                <a href="${data.workflow?.html_url || '#'}" target="_blank" class="workflow-name">
                    ${workflowName}
                </a>
                <span class="workflow-status ${status}">${statusText}</span>
            </div>
            <div class="workflow-details">
                <div class="workflow-detail-row">
                    <span class="detail-label">Branch:</span>
                    <span class="detail-value">${branchName}</span>
                </div>
                ${latestRun.head_commit?.message ? `
                    <div class="workflow-detail-row">
                        <span class="detail-label">Commit:</span>
                        <span class="detail-value" title="${latestRun.head_commit.message.replace(/"/g, '&quot;')}">
                            ${latestRun.head_commit.message.split('\n')[0].substring(0, 50)}${latestRun.head_commit.message.length > 50 ? '...' : ''}
                        </span>
                    </div>` : ''
                }
                ${latestRun.actor?.login ? `
                    <div class="workflow-detail-row">
                        <span class="detail-label">Run by:</span>
                        <span class="detail-value">
                            ${latestRun.actor.avatar_url ? 
                                `<img src="${latestRun.actor.avatar_url}" alt="${latestRun.actor.login}" class="avatar-icon" />` : ''
                            }
                            <a href="https://github.com/${latestRun.actor.login}" target="_blank">
                                ${latestRun.actor.login}
                            </a>
                        </span>
                    </div>` : ''
                }
                ${latestRun.created_at ? `
                    <div class="workflow-detail-row">
                        <span class="detail-label">Last run:</span>
                        <span class="detail-value" title="${new Date(latestRun.created_at).toLocaleString()}">
                            ${formatDate(latestRun.created_at)}
                        </span>
                    </div>` : ''
                }
                ${latestRun.html_url ? `
                    <div class="workflow-detail-row">
                        <a href="${latestRun.html_url}" target="_blank" class="btn btn-sm btn-outline-secondary mt-2">
                            <i class="bi bi-box-arrow-up-right"></i> View in GitHub
                        </a>
                    </div>` : ''
                }
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

// Function to handle repository search
async function handleRepoSearch(event) {
    const searchTerm = event.target.value.trim();
    const resultsContainer = document.getElementById('searchResults');
    
    // Show initial state if search is empty
    if (!searchTerm) {
        loadMyRepos();
        return;
    }
    
    // Show loading state
    resultsContainer.innerHTML = `
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 mb-0">Searching your repositories...</p>
        </div>`;
    
    try {
        // Search through the user's repositories
        const response = await fetch(`/api/my-repos?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const repos = data.items || [];
        
        if (repos.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center p-4 text-muted">
                    <i class="bi bi-search" style="font-size: 2rem; opacity: 0.5;"></i>
                    <p class="mt-2 mb-0">No repositories found matching "${searchTerm}"</p>
                </div>`;
            return;
        }
        
        // Display search results
        let html = '';
        const savedRepos = getSavedRepos();
        
        repos.forEach(repo => {
            const isAdded = savedRepos.some(r => 
                r.owner === repo.owner.login && r.name === repo.name
            );
            
            html += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">${repo.full_name}</h6>
                        <p class="mb-1 small text-muted">${repo.description || 'No description'}</p>
                        <div class="d-flex gap-2">
                            <span class="badge bg-secondary">${repo.language || 'Unknown'}</span>
                            <span class="badge bg-light text-dark">
                                <i class="bi bi-star-fill text-warning"></i> ${repo.stargazers_count.toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <button class="btn btn-sm ${isAdded ? 'btn-outline-secondary' : 'btn-primary'} add-repo" 
                            data-owner="${repo.owner.login}" 
                            data-repo="${repo.name}"
                            ${isAdded ? 'disabled' : ''}>
                        ${isAdded ? 'Added' : 'Add'}
                    </button>
                </div>`;
        });
        
        resultsContainer.innerHTML = html;
        
        // Add event listeners to the Add buttons
        document.querySelectorAll('.add-repo').forEach(button => {
            button.addEventListener('click', handleAddRepo);
        });
        
    } catch (error) {
        console.error('Error searching repositories:', error);
        resultsContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                Failed to search repositories. Please try again later.
            </div>`;
    }
}

// Handle adding a repository
async function handleAddRepo(event) {
    event.preventDefault();
    
    let owner, repoName;
    
    // Handle both form submission and button click
    if (event.target.matches('button.add-repo')) {
        owner = event.target.dataset.owner;
        repoName = event.target.dataset.repo;
    } else if (event.target.matches('form')) {
        const formData = new FormData(event.target);
        owner = formData.get('owner');
        repoName = formData.get('repo');
    } else {
        return;
    }
    
    // Check if repository is already added
    const savedRepos = getSavedRepos();
    if (savedRepos.some(r => r.owner === owner && r.name === repoName)) {
        showErrorInModal('This repository is already added');
        return;
    }
    
    // Show loading state
    const button = event.target.matches('button') ? event.target : event.target.querySelector('button[type="submit"]');
    const originalText = button ? button.innerHTML : '';
    if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';
    }
    
    try {
        // Add the repository to the list
        const newRepo = { owner, name: repoName, full_name: `${owner}/${repoName}` };
        savedRepos.push(newRepo);
        localStorage.setItem('addedRepos', JSON.stringify(savedRepos));
        
        // Update the UI
        updateReposList(savedRepos);
        
        // Close the modal if this was a form submission
        const modal = bootstrap.Modal.getInstance(document.getElementById('addRepoModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reset the form
        const form = document.getElementById('addRepoForm');
        if (form) form.reset();
        
        // Show success message
        const successAlert = document.createElement('div');
        successAlert.className = 'alert alert-success alert-dismissible fade show';
        successAlert.role = 'alert';
        successAlert.innerHTML = `
            <i class="bi bi-check-circle-fill me-2"></i>
            Successfully added ${owner}/${repoName} to your dashboard.
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        document.querySelector('main').prepend(successAlert);
        
        // Auto-hide the alert after 5 seconds
        setTimeout(() => {
            const alert = bootstrap.Alert.getOrCreateInstance(successAlert);
            alert.close();
        }, 5000);
        
    } catch (error) {
        console.error('Error adding repository:', error);
        showErrorInModal('Failed to add repository. Please try again.');
    } finally {
        // Reset button state
        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
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
