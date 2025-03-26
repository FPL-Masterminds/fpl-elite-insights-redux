let currentPlayers = []; // Store all players
let filteredPlayers = []; // Store filtered players
let teams = new Set(); // Store unique teams
let recommendedPlayers = {
    GKP: [],
    DEF: [],
    MID: [],
    FWD: []
};

// Add manager photo mapping
const managerPhotos = {
    'Klopp': '/images/managers/klopp.png',
    'Guardiola': '/images/managers/guardiola.png',
    // etc
};

// Current Premier League managers (as of February 2024)
const CURRENT_MANAGERS = {
    'Arteta': { team: 'Arsenal', photo: '/images/managers/arteta.png' },
    'Emery': { team: 'Aston Villa', photo: '/images/managers/emery.png' },
    'Iraola': { team: 'Bournemouth', photo: '/images/managers/iraola.png' },
    'De Zerbi': { team: 'Brighton', photo: '/images/managers/de-zerbi.png' },
    'Vincent Kompany': { team: 'Burnley', photo: '/images/managers/kompany.png' },
    'Pochettino': { team: 'Chelsea', photo: '/images/managers/pochettino.png' },
    'Oliver Glasner': { team: 'Crystal Palace', photo: '/images/managers/glasner.png' },
    'Dyche': { team: 'Everton', photo: '/images/managers/dyche.png' },
    'Silva': { team: 'Fulham', photo: '/images/managers/silva.png' },
    'Edwards': { team: 'Luton', photo: '/images/managers/edwards.png' },
    'Guardiola': { team: 'Man City', photo: '/images/managers/guardiola.png' },
    'Ten Hag': { team: 'Man Utd', photo: '/images/managers/ten-hag.png' },
    'Howe': { team: 'Newcastle', photo: '/images/managers/howe.png' },
    'Nuno': { team: 'Nottingham', photo: '/images/managers/nuno.png' },
    'Slot': { team: 'Liverpool', photo: '/images/managers/slot.png' },
    'Postecoglou': { team: 'Spurs', photo: '/images/managers/postecoglou.png' },
    'David Moyes': { team: 'West Ham', photo: '/images/managers/moyes.png' },
    'Gary O\'Neil': { team: 'Wolves', photo: '/images/managers/oneil.png' },
    'default': { team: 'Unknown', photo: '/images/managers/default-manager.png' }
};

function applyFilters() {
    const positionFilter = document.getElementById('positionFilter').value;
    const teamFilter = document.getElementById('teamFilter').value;
    
    filteredPlayers = currentPlayers.filter(player => {
        const matchesPosition = positionFilter === 'ALL' || player.position === positionFilter;
        const matchesTeam = teamFilter === 'ALL' || player.team === teamFilter;
        return matchesPosition && matchesTeam;
    });
    
    updateTable();
}

function updateTable() {
    const playerData = document.getElementById('playerData');
    playerData.innerHTML = filteredPlayers
        .map(player => `
            <tr>
                <td><img src="${player.photo}" alt="${player.name}" onerror="this.src='https://resources.premierleague.com/premierleague/photos/players/110x140/Photo-Missing.png'" width="55" height="70"></td>
                <td data-position="${player.position}">${player.position}</td>
                <td data-name>${player.name}</td>
                <td data-team>${player.team}</td>
                <td data-price>£${player.price}</td>
                <td data-ownership>${player.count}</td>
                <td data-percentage>${player.percentage}%</td>
                <td data-form>${player.form || '-'}</td>
                <td data-transfers>${(player.transfers_in_event || 0).toLocaleString()}</td>
                <td data-transfers-out>${(player.transfers_out_event || 0).toLocaleString()}</td>
                <td data-next-fixture>${player.next_fixture || '-'}</td>
                <td data-expected-points>${player.ep_next || '-'}</td>
                <td data-bonus>${player.bonus || 0}</td>
                <td data-total-points>${player.total_points || 0}</td>
            </tr>
        `)
        .join('');
}

function populateTeamFilter(teams) {
    const teamFilter = document.getElementById('teamFilter');
    const sortedTeams = Array.from(teams).sort();
    
    teamFilter.innerHTML = '<option value="ALL">All Teams</option>' +
        sortedTeams.map(team => `<option value="${team}">${team}</option>`).join('');
}

async function fetchData() {
    const teamCount = document.getElementById('teamCount').value;
    const playerData = document.getElementById('playerData');
    playerData.innerHTML = '<tr><td colspan="10">Loading...</td></tr>';

    try {
        // Get bootstrap static data which contains transfers info
        const bootstrapResponse = await fetch('/api/fpl/bootstrap-static/');
        const bootstrapData = await bootstrapResponse.json();
        
        // Store the transfers data in a map for quick lookup
        const transfersMap = {};
        bootstrapData.elements.forEach(player => {
            transfersMap[player.id] = player.transfers_in_event;
        });

        // Generate timestamp to prevent caching
        const timestamp = new Date().getTime();
        
        // Fetch general FPL data with cache-busting parameter
        const response = await fetch(`/api/fpl/bootstrap-static/?t=${timestamp}`);
        if (!response.ok) throw new Error(`Failed to fetch FPL data: ${response.status}`);
        const data = await response.json();

        // Get current gameweek - force refresh from API
        console.log("All events:", data.events.map(e => ({ id: e.id, is_current: e.is_current, is_next: e.is_next })));
        
        // Clear any cached data
        localStorage.removeItem('fplCachedData');
        
        // Find the current or next gameweek
        let currentGW;
        const currentEvent = data.events.find(event => event.is_current);
        const nextEvent = data.events.find(event => event.is_next);
        
        if (currentEvent) {
            console.log("Found current gameweek:", currentEvent.id);
            currentGW = currentEvent.id;
        } else if (nextEvent) {
            console.log("No current gameweek found, using next gameweek:", nextEvent.id);
            currentGW = nextEvent.id;
        } else {
            console.log("No current or next gameweek found, using max gameweek");
            currentGW = Math.max(...data.events.map(e => e.id));
        }
        
        console.log("Selected gameweek for data:", currentGW);

        // Fetch fixtures data
        try {
            const fixtureResponse = await fetch('/api/fpl/fixtures/');
            if (fixtureResponse.ok) {
                window.fixtureCache = await fixtureResponse.json();
                console.log(`Loaded ${window.fixtureCache.length} fixtures`);
            } else {
                console.error('Failed to fetch fixtures data');
            }
        } catch (error) {
            console.error('Error fetching fixtures:', error);
        }

        // Fetch top managers
        const leagueResponse = await fetch('/api/fpl/leagues-classic/314/standings/');
        if (!leagueResponse.ok) throw new Error(`Failed to fetch league data: ${leagueResponse.status}`);
        const leagueData = await leagueResponse.json();

        const topTeams = leagueData.standings.results.slice(0, teamCount);
        const playerCounts = {};

        // Update loading indicator to show current gameweek
        playerData.innerHTML = `<tr><td colspan="10">Loading team data for Gameweek ${currentGW} (0/${teamCount})...</td></tr>`;
        
        // Fetch each team's players with current gameweek
        for (let i = 0; i < topTeams.length; i++) {
            const team = topTeams[i];
            try {
                const teamResponse = await fetch(`/api/fpl/entry/${team.entry}/event/${currentGW}/picks/`);
                if (!teamResponse.ok) continue;
                const teamData = await teamResponse.json();
                
                teamData.picks.forEach(pick => {
                    playerCounts[pick.element] = (playerCounts[pick.element] || 0) + 1;
                });

                playerData.innerHTML = `<tr><td colspan="10">Loading team data for Gameweek ${currentGW} (${i + 1}/${teamCount})...</td></tr>`;
                
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Error fetching team ${team.entry}:`, error);
                continue;
            }
        }

        // Convert to array and sort by frequency
        currentPlayers = Object.entries(playerCounts)
            .map(([playerId, count]) => {
                const player = data.elements.find(p => p.id === parseInt(playerId));
                if (!player || !player.element_type || player.element_type > 4) return null;
                const team = data.teams.find(t => t.id === player.team);
                
                // Add team to teams Set
                if (team) teams.add(team.name);

                // Map element_type to position name
                const positions = {
                    1: 'GKP',
                    2: 'DEF',
                    3: 'MID',
                    4: 'FWD'
                };
                
                // Only return if we have a valid position
                const position = positions[player.element_type];
                if (!position) return null;
                
                const transfers = transfersMap[player.id] || 0;
                
                return {
                    id: player.id,
                    position: position,
                    name: player.web_name,
                    team: team?.name || 'Unknown',
                    price: (player.now_cost / 10).toFixed(1),
                    count: count,
                    percentage: ((count / teamCount) * 100).toFixed(1),
                    photo: getPhotoUrl(player, player.element_type),
                    total_points: player.total_points,
                    form: player.form,
                    next_fixture: getNextFixture(player.team, data.teams),
                    isManager: player.element_type > 4,
                    transfers_in_event: player.transfers_in_event || 0,
                    transfers_out_event: player.transfers_out_event || 0,
                    transfers_in: transfers,
                    ep_next: player.ep_next,
                    bonus: player.bonus,
                    total_points: player.total_points
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.count - a.count);

        // Populate team filter dropdown
        populateTeamFilter(teams);
        
        // Initialize filtered players
        filteredPlayers = currentPlayers;
        
        if (currentPlayers.length === 0) {
            throw new Error('No player data could be retrieved');
        }

        updateTable();
        categorizePlayers();

        // Update recommended team with currentPlayers
        recommendedPlayers = updateRecommendedTeam(currentPlayers);
        
        // Update views
        if (document.getElementById('pitch-view').classList.contains('active')) {
            updatePitchView();
        }

    } catch (error) {
        playerData.innerHTML = `<tr><td colspan="10">Error: ${error.message}</td></tr>`;
        console.error('Error:', error);
    }
}

// Update the view selector change handler
document.getElementById('viewSelector').addEventListener('change', function() {
    // Hide all content sections
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Show selected content
    const selectedView = this.value;
    document.getElementById(selectedView).classList.add('active');
    
    // Update pitch view if selected
    if (selectedView === 'pitch-view') {
        updatePitchView();
    } else if (selectedView === 'points-team') {
        optimizeTeamByPoints();
    }
});

// Add this function to calculate dynamic threshold
function getThresholdForTeamCount(teamCount) {
    const thresholds = {
        10: 50,
        20: 45,
        30: 40,
        40: 37.5,
        50: 35
    };
    return thresholds[teamCount];
}

// Update the updateRecommendedTeam function
function updateRecommendedTeam(playerData) {
    console.log("Starting updateRecommendedTeam with:", playerData.length, "players");
    if (!playerData || !Array.isArray(playerData)) {
        console.error('Invalid player data:', playerData);
        return;
    }

    // Initialize arrays for each position
    const positions = {
        GKP: [],
        DEF: [],
        MID: [],
        FWD: []
    };

    // Sort players by value (points per million)
    playerData.forEach(player => {
        console.log("Processing player:", player.name, "Position:", player.position);
        const position = player.position;
        if (!positions[position]) {
            console.warn(`Invalid position for player:`, player);
            return;
        }

        const value = player.total_points / (player.now_cost / 10);
        positions[position].push({
            ...player,
            value: value
        });
    });

    console.log("Positions after processing:", {
        GKP: positions.GKP.length,
        DEF: positions.DEF.length,
        MID: positions.MID.length,
        FWD: positions.FWD.length
    });

    // Sort each position by value
    Object.keys(positions).forEach(pos => {
        positions[pos].sort((a, b) => b.value - a.value);
    });

    // Filter by threshold and return
    const teamCount = parseInt(document.getElementById('teamCount').value);
    const threshold = getThresholdForTeamCount(teamCount);
    
    // Update threshold display
    document.getElementById('thresholdDisplay').textContent = `${threshold}%`;
    
    // Get filtered players and log results
    const result = {
        GKP: positions.GKP.filter(p => parseFloat(p.percentage) >= threshold).slice(0, 2),
        DEF: positions.DEF.filter(p => parseFloat(p.percentage) >= threshold).slice(0, 5),
        MID: positions.MID.filter(p => parseFloat(p.percentage) >= threshold).slice(0, 5),
        FWD: positions.FWD.filter(p => parseFloat(p.percentage) >= threshold).slice(0, 3)
    };
    
    console.log("Filtered players meeting threshold:", {
        GKP: result.GKP.length,
        DEF: result.DEF.length,
        MID: result.MID.length,
        FWD: result.FWD.length
    });
    
    // Set recommendedPlayers before generating HTML
    recommendedPlayers = result;
    
    // Update the display immediately
    const tbody = document.getElementById('recommendedPlayers');
    if (tbody) {
        console.log('Found tbody element, updating display');
        let html = '';
        ['GKP', 'DEF', 'MID', 'FWD'].forEach(position => {
            html += generatePositionSection(position, position === 'GKP' ? 2 : position === 'FWD' ? 3 : 5);
        });
        console.log('Final HTML:', html);
        tbody.innerHTML = html;
    } else {
        console.error('Could not find recommendedPlayers tbody element');
    }
    
    return recommendedPlayers;
}

function generatePositionSection(position, slots) {
    console.log(`Generating section for ${position}, slots: ${slots}`);
    console.log(`Players for ${position}:`, recommendedPlayers[position]);

    let html = `
        <tr class="position-header">
            <td colspan="6">${getPositionName(position)}</td>
        </tr>
    `;

    const players = recommendedPlayers[position];
    if (!players) {
        console.error(`No players found for position ${position}`);
        return html;
    }
    
    // Add existing players
    for (let i = 0; i < slots; i++) {
        if (players[i]) {
            console.log(`Adding player ${i}:`, players[i]);
            const playerRow = `
                <tr>
                    <td><img src="${players[i].photo}" alt="${players[i].name}" onerror="this.src='https://resources.premierleague.com/premierleague/photos/players/110x140/Photo-Missing.png'" width="55" height="70"></td>
                    <td>${players[i].position}</td>
                    <td>${players[i].name}</td>
                    <td>${players[i].team}</td>
                    <td>£${players[i].price}</td>
                    <td>${players[i].percentage}%</td>
                    <td>${players[i].form}</td>
                    <td>${(players[i].transfers_in_event || 0).toLocaleString()}</td>
                    <td>${players[i].next_fixture}</td>
                    <td>${players[i].total_points}</td>
                </tr>
            `;
            html += playerRow;
        } else {
            html += `
                <tr class="empty-slot">
                    <td colspan="6">Empty ${position} slot</td>
                </tr>
            `;
        }
    }
    console.log(`Generated HTML for ${position}:`, html);
    return html;
}

function getPositionName(pos) {
    const names = {
        GKP: 'Goalkeepers',
        DEF: 'Defenders',
        MID: 'Midfielders',
        FWD: 'Forwards'
    };
    return names[pos];
}

// Add event listener for teamCount changes to update threshold
document.getElementById('teamCount').addEventListener('change', () => {
    if (currentPlayers.length > 0) {
        updateRecommendedTeam(currentPlayers);
        if (document.getElementById('pitch-view').classList.contains('active')) {
            updatePitchView();
        }
    }
});

// Add this function to update the pitch view
function updatePitchView() {
    const teamCount = parseInt(document.getElementById('teamCount').value);
    const threshold = getThresholdForTeamCount(teamCount);
    
    // Update second threshold display
    document.getElementById('thresholdDisplay2').textContent = `${threshold}%`;

    // Clear all slots
    document.querySelectorAll('.player-slot').forEach(slot => {
        slot.innerHTML = '';
        slot.classList.remove('filled');
    });

    // Helper function to create player card
    function createPlayerCard(player) {
        const cardClass = player.isManager ? 'player-card manager' : 'player-card';
        return `
            <div class="${cardClass}">
                <img src="${player.photo}" alt="${player.name}" 
                     onerror="this.src='${player.isManager ? '/images/managers/default-manager.png' : 'https://resources.premierleague.com/premierleague/photos/players/110x140/Photo-Missing.png'}'">
                <div class="player-info">${player.name}</div>
                <div class="player-team">${player.team} | ${player.isManager ? 'Manager' : player.position}</div>
                <div class="stats-row">
                    <div class="player-price">£${(parseFloat(player.price)).toFixed(1)}</div>
                    <div class="player-ownership">${player.percentage}%</div>
                </div>
            </div>
        `;
    }

    // Populate slots by position
    Object.entries(recommendedPlayers).forEach(([position, players]) => {
        // Map position codes to class names
        const classMap = {
            'GKP': 'gkp',
            'DEF': 'def',
            'MID': 'mid',
            'FWD': 'fwd'
        };
        const className = classMap[position];
        const slots = document.querySelectorAll(`.player-slot.${className}`);
        players.forEach((player, index) => {
            if (slots[index]) {
                slots[index].innerHTML = createPlayerCard(player);
                slots[index].classList.add('filled');
            }
        });
    });
}

function categorizePlayers() {
    const teamCount = parseInt(document.getElementById('teamCount').value);
    
    // Create categories
    const categories = {
        template: [], // 35%+
        popular: [], // 20-35%
        differential: [], // 10-20%
        strongDiff: [], // 5-10%
        ultraDiff: [] // <5%
    };

    currentPlayers.forEach(player => {
        const ownership = parseFloat(player.percentage);
        if (ownership >= 35) {
            categories.template.push(player);
        } else if (ownership >= 20) {
            categories.popular.push(player);
        } else if (ownership >= 10) {
            categories.differential.push(player);
        } else if (ownership >= 5) {
            categories.strongDiff.push(player);
        } else {
            categories.ultraDiff.push(player);
        }
    });

    // Update the interface
    document.getElementById('templatePlayers').innerHTML = createPlayerList(categories.template);
    document.getElementById('differentialPlayers').innerHTML = createPlayerList(categories.differential);
    document.getElementById('strongDiffPlayers').innerHTML = createPlayerList(categories.strongDiff);
}

function createPlayerList(players) {
    return players
        .sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage))
        .map(player => `
            <div class="player-card-small">
                <img src="${player.photo}" alt="${player.name}">
                <div class="player-details">
                    <div class="player-name">${player.name}</div>
                    <div class="player-meta">
                        <span class="team">${player.team}</span>
                        <span class="position">${player.position}</span>
                    </div>
                    <div class="player-stats">
                        <span class="price">£${player.price}</span>
                        <span class="ownership">${player.percentage}%</span>
                    </div>
                </div>
            </div>
        `)
        .join('');
}

function optimizeTeamByPoints() {
    // Calculate points per million for each player
    const calculateValue = (player) => player.total_points / parseFloat(player.price);

    // Reserve budgets for each position
    const budgetLimits = {
        GKP: 10,  // Keep at £10m - good value keepers are available
        DEF: 25,  // £25m gives room for 1-2 premium + value picks
        MID: 35,  // Keep at £35m for premium mids
        FWD: 30   // £30m allows for premium + mid-price forwards
    };

    // Create position buckets and only include players owned by Top 50
    const players = {
        GKP: currentPlayers.filter(p => p.position === 'GKP' && p.count > 0),
        DEF: currentPlayers.filter(p => p.position === 'DEF' && p.count > 0),
        MID: currentPlayers.filter(p => p.position === 'MID' && p.count > 0),
        FWD: currentPlayers.filter(p => p.position === 'FWD' && p.count > 0)
    };

    // Sort each position by value (points per million)
    for (let pos in players) {
        players[pos].sort((a, b) => calculateValue(b) - calculateValue(a));
    }

    // Initialize optimal team
    let optimalTeam = {
        GKP: [],
        DEF: [],
        MID: [],
        FWD: [],
        totalCost: 0,
        totalPoints: 0
    };

    const limits = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
    
    // First pass: Ensure minimum coverage in each position
    for (let pos in players) {
        const positionBudget = budgetLimits[pos];
        let positionCost = 0;
        
        // Get required number of players while respecting position budget
        for (let i = 0; i < limits[pos]; i++) {
            if (players[pos][i] && positionCost + parseFloat(players[pos][i].price) <= positionBudget) {
                optimalTeam[pos].push(players[pos][i]);
                positionCost += parseFloat(players[pos][i].price);
                optimalTeam.totalCost += parseFloat(players[pos][i].price);
                optimalTeam.totalPoints += players[pos][i].total_points;
            }
        }
    }

    // Update the interface with explanation
    const explanation = `
        <div class="optimization-explanation glass-container">
            <h3>How This Team Was Selected</h3>
            <p>This algorithm uses a sophisticated approach to build the optimal team:</p>
            <ol>
                <li>Calculates points per million (value) for each player</li>
                <li>Reserves specific budgets for each position (GK: £10m, DEF: £25m, MID: £35m, FWD: £30m)</li>
                <li>Prioritizes players with the best value while ensuring all positions are filled</li>
                <li>Only considers players owned by the Top 50 teams</li>
                <li>Maintains team balance across all positions</li>
            </ol>
            <p>Total Budget: £100m | Required Players: 15 (2 GK, 5 DEF, 5 MID, 3 FWD)</p>
        </div>
    `;

    updateOptimizedTeamView(optimalTeam, explanation);
}

function updateOptimizedTeamView(team, explanation) {
    const container = document.getElementById('optimizedTeam');
    const totalCost = document.getElementById('totalCost');
    const totalPoints = document.getElementById('totalPoints');

    let html = explanation;  // Add explanation at the top
    
    // Add sections for each position
    ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
        html += `
            <div class="position-section">
                <h4>${getPositionName(pos)}</h4>
                <div class="players-grid">
                    ${team[pos].map(player => `
                        <div class="player-card-small">
                            <img src="${player.photo}" alt="${player.name}">
                            <div class="player-details">
                                <div class="player-name">${player.name}</div>
                                <div class="player-meta">
                                    <span class="team">${player.team}</span>
                                </div>
                                <div class="player-stats">
                                    <span class="price">£${player.price}</span>
                                    <span class="points">${player.total_points} pts</span>
                                    <span class="ownership">${player.percentage}%</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    totalCost.textContent = `£${team.totalCost.toFixed(1)}m`;
    totalPoints.textContent = team.totalPoints;
}

function filterPlayers(players, minOwnership = 35) {
    // Group players by position without limits
    const gkp = players.filter(p => p.position === 'GKP' && p.percentage >= minOwnership);
    const def = players.filter(p => p.position === 'DEF' && p.percentage >= minOwnership);
    const mid = players.filter(p => p.position === 'MID' && p.percentage >= minOwnership);
    const fwd = players.filter(p => p.position === 'FWD' && p.percentage >= minOwnership);

    return [...gkp, ...def, ...mid, ...fwd];
}

function getPosition(elementType) {
    const positions = {
        1: 'GKP',
        2: 'DEF',
        3: 'MID',
        4: 'FWD'
    };
    return positions[elementType] || 'Unknown';
}

function getPhotoUrl(player, element_type) {
    if (element_type <= 4) {
        return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.code}.png`;
    }
    
    // For managers, log complete data to see exact web_names
    console.log('Raw Manager Data:', {
        web_name: player.web_name,
        full_data: player,
        element_type: element_type,
        team_id: player.team,
        code: player.code
    });

    const managerName = player.web_name;
    console.log('Manager data:', {
        name: managerName,
        id: player.id,
        team: player.team,
        element_type: element_type,
        raw: player
    });
    
    // Try to find the manager in our list (case insensitive)
    const manager = Object.entries(CURRENT_MANAGERS).find(([name]) => 
        name.toLowerCase() === managerName.toLowerCase()
    );
    
    if (manager) {
        console.log('Found manager:', manager[1]);
        return manager[1].photo;
    }
    
    console.log('Manager not found in current list:', managerName);
    return CURRENT_MANAGERS.default.photo;
}

function createDetailedPlayerCard(player, isDifferential = false) {
    return `
        <div class="player-card ${isDifferential ? 'differential' : ''}">
            <img src="${player.photo}" alt="${player.name}" class="player-image"
                onerror="this.src='${player.isManager ? '/images/managers/default-manager.png' : 'https://resources.premierleague.com/premierleague/photos/players/110x140/Photo-Missing.png'}'">
            <div class="player-details">
                <div class="player-name">${player.name}</div>
                <div class="player-team">${player.team} | ${player.isManager ? 'Manager' : player.position}</div>
                <div class="player-stats">
                    <span class="stat">£${(parseFloat(player.now_cost) / 10).toFixed(1)}m</span>
                    <span class="stat">${player.total_points} pts</span>
                    <span class="stat">${player.percentage}% owned</span>
                    <span class="stat">${player.points_per_game} PPG</span>
                </div>
            </div>
        </div>
    `;
}

// Function to get next fixture for a player's team
function getNextFixture(teamId, teams) {
    try {
        // If fixtures haven't been loaded yet, return placeholder
        if (!window.fixtureCache) {
            return 'Loading...';
        }
        
        // Find upcoming fixtures for this team
        const upcomingFixtures = window.fixtureCache.filter(fix => 
            (fix.team_h === teamId || fix.team_a === teamId) && 
            fix.finished === false && 
            fix.event !== null
        );
        
        // Sort by event (gameweek)
        upcomingFixtures.sort((a, b) => a.event - b.event);
        
        // Get the next fixture if available
        if (upcomingFixtures.length > 0) {
            const nextFix = upcomingFixtures[0];
            const isHome = nextFix.team_h === teamId;
            
            // Get opponent team name
            const opponentId = isHome ? nextFix.team_a : nextFix.team_h;
            const opponent = teams.find(t => t.id === opponentId);
            
            // Format as "vs OPP" or "@ OPP" for home/away
            return isHome ? `vs ${opponent?.short_name || 'Unknown'}` : `@ ${opponent?.short_name || 'Unknown'}`;
        }
        
        return '-';
    } catch (error) {
        console.error('Error processing fixture data:', error);
        return '-';
    }
}

// Add a function to force refresh all data
function forceRefresh() {
    console.log("Force refreshing data...");
    
    // Add a timestamp parameter to force browser to bypass cache
    const timestamp = new Date().getTime();
    
    // Clear all cached data
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear fixture cache
    window.fixtureCache = null;
    
    // Clear player data
    currentPlayers = [];
    filteredPlayers = [];
    teams = new Set();
    
    // Fetch fresh data
    fetchData();
    
    // Add visual feedback
    const playerData = document.getElementById('playerData');
    if (playerData) {
        playerData.innerHTML = '<tr><td colspan="10">Refreshing data from FPL API...</td></tr>';
    }
}

// Add event listener for window load
window.addEventListener('load', function() {
    // Add refresh button to controls
    const controlsDiv = document.querySelector('.controls');
    if (controlsDiv) {
        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Force Refresh';
        refreshButton.onclick = forceRefresh;
        refreshButton.classList.add('refresh-button');
        controlsDiv.appendChild(refreshButton);
    }
});

function processPlayerData(player, ownership, teamData) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><img src="https://resources.premierleague.com/premierleague/photos/players/40x40/p${player.code}.png" onerror="this.src='player-silhouette.png'" alt="${player.web_name}"></td>
        <td>${player.element_type === 1 ? 'GKP' : player.element_type === 2 ? 'DEF' : player.element_type === 3 ? 'MID' : 'FWD'}</td>
        <td>${player.web_name}</td>
        <td>${teamData.find(team => team.id === player.team).short_name}</td>
        <td>£${(player.now_cost / 10).toFixed(1)}m</td>
        <td>${ownership.count || 0}</td>
        <td>${((ownership.count / selectedTeamCount) * 100).toFixed(1)}%</td>
        <td>${player.form}</td>
        <td>${(player.transfers_in_event || 0).toLocaleString()}</td>
        <td>${getNextFixture(player.team, fixtures)}</td>
        <td>${player.total_points}</td>
    `;
    return row;
}

function downloadCSV() {
    // Get headers from table
    const headers = Array.from(document.querySelectorAll('table thead th'))
        .map(th => th.textContent.trim());
    
    // Get data from filteredPlayers
    const csvData = filteredPlayers.map(player => [
        player.position,
        player.name,
        player.team,
        player.price,
        player.count,
        player.percentage,
        player.form || '',
        (player.transfers_in_event || 0).toLocaleString(),
        (player.transfers_out_event || 0).toLocaleString(),
        player.next_fixture || '',
        player.ep_next || '',
        player.bonus || '',
        player.total_points || ''
    ]);

    // Add headers as first row
    csvData.unshift(headers);

    // Convert to CSV string
    const csvString = csvData
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

    // Create download link
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fpl_data_${new Date().toISOString().split('T')[0]}.csv`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
} 