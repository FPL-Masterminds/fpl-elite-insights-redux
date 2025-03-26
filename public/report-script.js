function getPosition(elementType) {
    const positions = {
        1: 'GKP',
        2: 'DEF',
        3: 'MID',
        4: 'FWD'
    };
    return positions[elementType] || 'Unknown';
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Test if we can write to elements
        const priceInsights = document.getElementById('priceInsights');
        const chipInsights = document.getElementById('chipInsights');
        const captainInsights = document.getElementById('captainInsights');
        const squadInsights = document.getElementById('squadStructureInsights');
        
        if (priceInsights) priceInsights.innerHTML = '<li>Testing price insights</li>';
        if (chipInsights) chipInsights.innerHTML = '<li>Testing chip insights</li>';
        if (captainInsights) captainInsights.innerHTML = '<li>Testing captain insights</li>';
        if (squadInsights) squadInsights.innerHTML = '<li>Testing squad insights</li>';

        // Generate timestamp to prevent caching
        const timestamp = new Date().getTime();
        
        // Check if this is a forced refresh
        const isForceRefresh = window.location.search.includes('refresh=');
        if (isForceRefresh) {
            console.log("This is a forced refresh - using fresh data");
        }

        // Fetch FPL data with cache-busting parameter
        const response = await fetch(`/api/bootstrap-static/?t=${timestamp}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status}`);
        }
        const data = await response.json();

        // Get current gameweek - improved logic with logging
        console.log("Report page - All events:", data.events.map(e => ({ id: e.id, is_current: e.is_current, is_next: e.is_next })));
        
        // Clear any cached data
        localStorage.removeItem('fplReportCachedData');
        
        // Find the current or next gameweek
        let currentGW;
        const currentEvent = data.events.find(event => event.is_current);
        const nextEvent = data.events.find(event => event.is_next);
        
        if (currentEvent) {
            console.log("Report page - Found current gameweek:", currentEvent.id);
            currentGW = currentEvent.id;
        } else if (nextEvent) {
            console.log("Report page - No current gameweek found, using next gameweek:", nextEvent.id);
            currentGW = nextEvent.id;
        } else {
            console.log("Report page - No current or next gameweek found, using max gameweek");
            currentGW = Math.max(...data.events.map(e => e.id));
        }
        
        console.log("Report page - Selected gameweek for data:", currentGW);

        // Find next gameweek and its deadline
        const nextGW = data.events.find(event => event.is_next);
        if (nextGW) {
            const deadline = new Date(nextGW.deadline_time);
            const formattedDeadline = deadline.toLocaleString('en-GB', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            document.getElementById('deadlineInfo').textContent = 
                `Gameweek ${nextGW.id} Deadline: ${formattedDeadline}`;
        }

        // Fetch top 50 managers data
        const leagueResponse = await fetch('/api/leagues-classic/314/standings/');
        const leagueData = await leagueResponse.json();
        const topTeams = leagueData.standings.results.slice(0, 50);

        // Process player data
        console.log('Processing player data...');
        const playerData = await processPlayerData(data, topTeams);
        
        // Update sections
        updateExecutiveSummary(playerData);
        updateTemplateAnalysis(playerData);
        updateDifferentialAnalysis(playerData);
        updateOptimizedTeam(playerData);
        createCharts(playerData);

        // Now do strategy analysis after other sections are loaded
        console.log('Starting strategy analysis...');
        await updateStrategyAnalysis(topTeams, currentGW, data);
        console.log('Strategy analysis complete');

        // Populate top managers list
        const topManagersList = document.getElementById('topManagersList');
        topTeams.forEach((manager, index) => {
            topManagersList.innerHTML += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${manager.player_name}</td>
                    <td>${manager.entry_name}</td>
                    <td>${manager.total}</td>
                    <td>${manager.event_total}</td>
                </tr>
            `;
        });

        // Update summary stats
        document.getElementById('totalPlayersAnalyzed').textContent = playerData.length;
        const templatePlayers = playerData.filter(p => parseFloat(p.percentage) >= 35);
        const differentials = playerData.filter(p => parseFloat(p.percentage) < 20 && parseFloat(p.percentage) > 5);
        
        // Update cover page counts
        document.getElementById('coverTemplateCount').textContent = templatePlayers.length;
        document.getElementById('coverDifferentialCount').textContent = differentials.length;
        
        // Update summary table counts
        document.getElementById('summaryTemplateCount').textContent = templatePlayers.length;
        document.getElementById('summaryDifferentialCount').textContent = differentials.length;
        
        // Calculate and display average points
        document.getElementById('templateAvgPoints').textContent = 
            Math.round(templatePlayers.reduce((acc, p) => acc + p.total_points, 0) / templatePlayers.length);
        document.getElementById('differentialAvgPoints').textContent = 
            Math.round(differentials.reduce((acc, p) => acc + p.total_points, 0) / differentials.length);

        // Calculate and display ownership ranges
        const templateRange = `${Math.min(...templatePlayers.map(p => p.percentage))}% - ${Math.max(...templatePlayers.map(p => p.percentage))}%`;
        const diffRange = `${Math.min(...differentials.map(p => p.percentage))}% - ${Math.max(...differentials.map(p => p.percentage))}%`;
        
        document.getElementById('templateOwnershipRange').textContent = templateRange;
        document.getElementById('differentialOwnershipRange').textContent = diffRange;

        // Generate and update gameweek summary
        const summaryContent = document.getElementById('gameweekSummaryContent');
        if (summaryContent) {
            summaryContent.innerHTML = await generateGameweekSummary();
        }

    } catch (error) {
        console.error('Error in main process:', error);
        console.error('Stack:', error.stack);
    }
});

function updateExecutiveSummary(playerData) {
    const keyFindings = document.getElementById('keyFindings');
    const templatePlayers = playerData.filter(p => parseFloat(p.percentage) >= 35);
    const differentials = playerData.filter(p => parseFloat(p.percentage) < 20 && parseFloat(p.percentage) > 5);

    keyFindings.innerHTML = `
        <div class="finding">
            <h3>Template Core</h3>
            <p>The template core consists of ${templatePlayers.length} players who are owned by more than 35% of top managers.</p>
        </div>
        <div class="finding">
            <h3>Differential Opportunities</h3>
            <p>Identified ${differentials.length} potential differentials with significant points potential.</p>
        </div>
    `;
}

// Process player data from the API
async function processPlayerData(data, topTeams) {
    const playerCounts = {};
    
    // Generate timestamp to prevent caching
    const timestamp = new Date().getTime();
    
    // Use the same improved gameweek logic
    console.log("ProcessPlayerData - All events:", data.events.map(e => ({ id: e.id, is_current: e.is_current, is_next: e.is_next })));
    
    // Find the current or next gameweek
    let currentGW;
    const currentEvent = data.events.find(event => event.is_current);
    const nextEvent = data.events.find(event => event.is_next);
    
    if (currentEvent) {
        console.log("ProcessPlayerData - Found current gameweek:", currentEvent.id);
        currentGW = currentEvent.id;
    } else if (nextEvent) {
        console.log("ProcessPlayerData - No current gameweek found, using next gameweek:", nextEvent.id);
        currentGW = nextEvent.id;
    } else {
        console.log("ProcessPlayerData - No current or next gameweek found, using max gameweek");
        currentGW = Math.max(...data.events.map(e => e.id));
    }
    
    console.log("ProcessPlayerData - Selected gameweek for data:", currentGW);

    // Fetch each team's players with timestamp to prevent caching
    for (let i = 0; i < topTeams.length; i++) {
        const team = topTeams[i];
        try {
            const teamResponse = await fetch(`/api/entry/${team.entry}/event/${currentGW}/picks/?t=${timestamp}`);
            const teamData = await teamResponse.json();
            
            teamData.picks.forEach(pick => {
                playerCounts[pick.element] = (playerCounts[pick.element] || 0) + 1;
            });
        } catch (error) {
            console.error(`Error fetching team ${team.entry}:`, error);
        }
    }

    // Convert to detailed player objects
    return Object.entries(playerCounts)
        .map(([playerId, count]) => {
            const player = data.elements.find(p => p.id === parseInt(playerId));
            if (!player) return null;
            const team = data.teams.find(t => t.id === player.team);
            
            return {
                id: player.id,
                name: player.web_name,
                team: team?.name || 'Unknown',
                position: getPosition(player.element_type),
                price: (player.now_cost / 10).toFixed(1),
                total_points: player.total_points,
                points_per_game: player.points_per_game,
                count: count,
                percentage: ((count / topTeams.length) * 100).toFixed(1),
                form: player.form,
                selected_by_percent: player.selected_by_percent,
                photo: `https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.code}.png`
            };
        })
        .filter(Boolean);
}

function updateTemplateAnalysis(playerData) {
    const templateSection = document.getElementById('templatePlayersSection');
    const templatePlayers = playerData
        .filter(p => parseFloat(p.percentage) >= 35)
        .sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage));

    let html = `
        <div class="section-intro">
            <p>The following players form the core template of successful teams, owned by 35% or more of the top 50 managers.</p>
        </div>
        <div class="player-grid">
    `;

    templatePlayers.forEach(player => {
        html += createDetailedPlayerCard(player);
    });

    html += '</div>';
    templateSection.innerHTML = html;
}

function updateDifferentialAnalysis(playerData) {
    const differentialSection = document.getElementById('differentialPlayersSection');
    const differentials = playerData
        .filter(p => parseFloat(p.percentage) < 20 && 
                    parseFloat(p.percentage) > 5 && 
                    p.total_points > 0)
        .sort((a, b) => b.total_points - a.total_points);

    let html = `
        <div class="section-intro">
            <p>These players represent potential differential picks, owned by 5-20% of top managers but showing strong performance metrics.</p>
        </div>
        <div class="player-grid">
    `;

    differentials.forEach(player => {
        html += createDetailedPlayerCard(player, true);
    });

    html += '</div>';
    differentialSection.innerHTML = html;
}

function updateOptimizedTeam(playerData) {
    const optimizedSection = document.getElementById('optimizedSquadSection');
    const team = optimizeTeamByPoints(playerData);

    let html = `
        <div class="section-intro">
            <p>This section presents an optimized selection of players based on their total points and position-specific budget constraints. 
            The selection algorithm prioritizes players who have demonstrated consistent performance while maintaining positional balance. 
            Note that this is not a complete 15-player squad, but rather a strategic selection of key players you should consider based on:
            </p>
            <ul>
                <li>Total points accumulated</li>
                <li>Position-specific budget allocation</li>
                <li>Ownership among top managers</li>
                <li>Team balance considerations</li>
            </ul>
            <div class="team-summary">
                <div class="team-stat">Total Points: ${team.totalPoints}</div>
                <div class="team-stat">Total Cost: £${team.totalCost.toFixed(1)}m</div>
            </div>
        </div>
    `;

    ['GKP', 'DEF', 'MID', 'FWD'].forEach(pos => {
        html += `
            <div class="position-group">
                <h3>${getPositionName(pos)}</h3>
                <div class="player-grid">
                    ${team[pos].map(player => createDetailedPlayerCard(player)).join('')}
                </div>
            </div>
        `;
    });

    optimizedSection.innerHTML = html;
}

function updateValueAnalysis(playerData) {
    const valueSection = document.getElementById('valueMetricsSection');
    const valueMetrics = calculateValueMetrics(playerData);

    let html = `
        <div class="section-intro">
            <p>Analysis of points per million and value metrics across different price ranges.</p>
        </div>
        <div class="value-charts">
            ${createValueChart(valueMetrics)}
        </div>
    `;

    valueSection.innerHTML = html;
}

// Helper functions
function createDetailedPlayerCard(player, isDifferential = false) {
    return `
        <div class="player-card ${isDifferential ? 'differential' : ''}">
            <img src="${player.photo}" alt="${player.name}" class="player-image">
            <div class="player-details">
                <div class="player-name">${player.name}</div>
                <div class="player-team">${player.team} | ${player.position}</div>
                <div class="player-stats">
                    <span class="stat">£${player.price}m</span>
                    <span class="stat">${player.total_points} pts</span>
                    <span class="stat">${player.percentage}% owned</span>
                    <span class="stat">${player.points_per_game} PPG</span>
                </div>
                ${isDifferential ? `
                    <div class="differential-analysis">
                        <p>Potential upside: High points potential with low ownership</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function createCharts(playerData) {
    try {
        // Ownership Distribution Chart
        const ownershipCtx = document.getElementById('ownershipDistribution').getContext('2d');
        if (!ownershipCtx) {
            console.error('Could not find ownership distribution canvas');
            return;
        }
        const ownershipData = {
            labels: ['Template (>35%)', 'Popular (20-35%)', 'Differential (10-20%)', 'High Risk (<10%)'],
            datasets: [{
                data: [
                    playerData.filter(p => parseFloat(p.percentage) > 35).length,
                    playerData.filter(p => parseFloat(p.percentage) <= 35 && parseFloat(p.percentage) > 20).length,
                    playerData.filter(p => parseFloat(p.percentage) <= 20 && parseFloat(p.percentage) > 10).length,
                    playerData.filter(p => parseFloat(p.percentage) <= 10).length
                ],
                backgroundColor: ['#00ff87', '#37003c', '#e90052', '#04f5ff']
            }]
        };

        new Chart(ownershipCtx, {
            type: 'doughnut',
            data: ownershipData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#333'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Player Ownership Distribution',
                        color: '#333',
                        font: {
                            size: 16
                        }
                    }
                }
            }
        });

        // Position Distribution Chart
        const positionCtx = document.getElementById('positionDistribution').getContext('2d');
        const positionData = {
            labels: ['GKP', 'DEF', 'MID', 'FWD'],
            datasets: [{
                label: 'Template Players',
                data: ['GKP', 'DEF', 'MID', 'FWD'].map(pos => 
                    playerData.filter(p => p.position === pos && parseFloat(p.percentage) > 35).length
                ),
                backgroundColor: '#00ff87'
            }, {
                label: 'Differential Options',
                data: ['GKP', 'DEF', 'MID', 'FWD'].map(pos => 
                    playerData.filter(p => p.position === pos && parseFloat(p.percentage) <= 20 && parseFloat(p.percentage) > 5).length
                ),
                backgroundColor: '#37003c'
            }]
        };

        new Chart(positionCtx, {
            type: 'bar',
            data: positionData,
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Players'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Position Distribution Analysis',
                        font: {
                            size: 16
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating charts:', error);
    }
}

// Helper function to get full position name
function getPositionName(pos) {
    const positions = {
        'GKP': 'Goalkeepers',
        'DEF': 'Defenders',
        'MID': 'Midfielders',
        'FWD': 'Forwards'
    };
    return positions[pos] || pos;
}

function optimizeTeamByPoints(playerData) {
    // Calculate points per million for each player
    const calculateValue = (player) => player.total_points / parseFloat(player.price);

    // Reserve budgets for each position
    const budgetLimits = {
        GKP: 10,  // Keep at £10m - good value keepers are available
        DEF: 25,  // £25m gives room for 1-2 premium + value picks
        MID: 35,  // Keep at £35m for premium mids
        FWD: 30   // £30m allows for premium + mid-price forwards
    };

    // Create position buckets
    const players = {
        GKP: playerData.filter(p => p.position === 'GKP'),
        DEF: playerData.filter(p => p.position === 'DEF'),
        MID: playerData.filter(p => p.position === 'MID'),
        FWD: playerData.filter(p => p.position === 'FWD')
    };

    // Sort each position by points
    for (let pos in players) {
        players[pos].sort((a, b) => b.total_points - a.total_points);
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
    
    // Build team within position budgets
    for (let pos in players) {
        const positionBudget = budgetLimits[pos];
        let positionCost = 0;
        
        for (let i = 0; i < limits[pos]; i++) {
            if (players[pos][i] && positionCost + parseFloat(players[pos][i].price) <= positionBudget) {
                optimalTeam[pos].push(players[pos][i]);
                positionCost += parseFloat(players[pos][i].price);
                optimalTeam.totalCost += parseFloat(players[pos][i].price);
                optimalTeam.totalPoints += players[pos][i].total_points;
            }
        }
    }

    return optimalTeam;
}

function calculateValueMetrics(playerData) {
    return playerData.map(player => ({
        ...player,
        valueScore: player.total_points / parseFloat(player.price)
    })).sort((a, b) => b.valueScore - a.valueScore);
}

function createValueChart(valueMetrics) {
    // Implement value chart visualization
    return `<div class="value-chart">Value analysis visualization coming soon...</div>`;
}

async function updateStrategyAnalysis(topTeams, currentGW, bootstrapData) {
    try {
        console.log('API Flow Check - Initial Data:', {
            teamsCount: topTeams.length,
            currentGW: currentGW,
            bootstrapDataExists: !!bootstrapData,
            sampleTeam: topTeams[0]
        });

        const managerHistories = await Promise.all(
            topTeams.map(async team => {
                const historyResponse = await fetch(`/api/entry/${team.entry}/history/`);
                console.log(`API Response - History for ${team.entry}:`, historyResponse.status);
                if (!historyResponse.ok) throw new Error(`History fetch failed for ${team.entry}`);
                const historyData = await historyResponse.json();
                
                const teamResponse = await fetch(`/api/entry/${team.entry}/event/${currentGW}/picks/`);
                console.log(`API Response - Picks for ${team.entry}:`, teamResponse.status);
                if (!teamResponse.ok) throw new Error(`Team fetch failed for ${team.entry}`);
                const teamData = await teamResponse.json();
                
                // Map player data with positions
                teamData.picks = teamData.picks.map(pick => ({
                    ...pick,
                    position: getPosition(bootstrapData.elements.find(e => e.id === pick.element).element_type)
                }));
                
                console.log(`Processed manager ${team.entry}`);
                return {
                    manager: team,
                    history: historyData,
                    currentTeam: teamData
                };
            })
        );
        console.log('All manager histories loaded:', managerHistories.length);

        // Update each analysis section
        updatePriceAnalysis(managerHistories);
        updateChipAnalysis(managerHistories);
        updateCaptainAnalysis(managerHistories, bootstrapData);
        updateSquadStructureAnalysis(managerHistories, bootstrapData);

    } catch (error) {
        console.error('Error updating strategy analysis:', error);
        console.error('Stack:', error.stack);
    }
}

function updatePriceAnalysis(managerHistories) {
    console.log('Starting price analysis with:', managerHistories);
    const priceInsights = document.getElementById('priceInsights');
    console.log('Found priceInsights element:', priceInsights);
    
    // Calculate team value trends
    const teamValues = managerHistories.map(manager => {
        console.log('Processing manager history:', manager);
        console.log('Current history data:', manager.history.current);
        const currentValue = manager.history.current.map(gw => gw.value);
        return {
            name: manager.manager.player_name,
            values: currentValue,
            maxValue: Math.max(...currentValue) / 10,
            currentValue: currentValue[currentValue.length - 1] / 10
        };
    });

    console.log('Calculated team values:', teamValues);

    // Sort by current team value
    teamValues.sort((a, b) => b.currentValue - a.currentValue);

    // Add insights
    if (priceInsights) {
        priceInsights.innerHTML = `
            <li>Highest team value: £${teamValues[0].maxValue}m (${teamValues[0].name})</li>
            <li>Average team value: £${(teamValues.reduce((acc, tv) => acc + tv.currentValue, 0) / teamValues.length).toFixed(1)}m</li>
            <li>Value range: £${(teamValues[teamValues.length - 1].currentValue).toFixed(1)}m - £${teamValues[0].currentValue.toFixed(1)}m</li>
        `;
        console.log('Updated priceInsights HTML');
    } else {
        console.error('priceInsights element not found');
    }
}

function updateChipAnalysis(managerHistories) {
    const chipInsights = document.getElementById('chipInsights');
    
    // Analyze chip usage
    const chipUsage = {
        'wildcard': { used: 0, avgWeek: 0, weeks: [] },
        'freehit': { used: 0, avgWeek: 0, weeks: [] },
        'bboost': { used: 0, avgWeek: 0, weeks: [] },
        '3xc': { used: 0, avgWeek: 0, weeks: [] }
    };

    managerHistories.forEach(manager => {
        const chips = manager.history.chips || [];
        chips.forEach(chip => {
            if (chipUsage[chip.name]) {
                chipUsage[chip.name].used++;
                chipUsage[chip.name].weeks.push(chip.event);
            }
        });
    });

    // Calculate averages
    Object.keys(chipUsage).forEach(chip => {
        if (chipUsage[chip].weeks.length > 0) {
            chipUsage[chip].avgWeek = Math.round(
                chipUsage[chip].weeks.reduce((a, b) => a + b, 0) / chipUsage[chip].weeks.length
            );
        }
    });

    if (chipInsights) {
        chipInsights.innerHTML = `
            <li>Wildcard: ${chipUsage.wildcard.used} managers used (avg GW${chipUsage.wildcard.avgWeek})</li>
            <li>Free Hit: ${chipUsage.freehit.used} managers used (avg GW${chipUsage.freehit.avgWeek})</li>
            <li>Bench Boost: ${chipUsage.bboost.used} managers used (avg GW${chipUsage.bboost.avgWeek})</li>
            <li>Triple Captain: ${chipUsage['3xc'].used} managers used (avg GW${chipUsage['3xc'].avgWeek})</li>
        `;
    }
}

function updateCaptainAnalysis(managerHistories, bootstrapData) {
    const captainInsights = document.getElementById('captainInsights');
    
    // Count captain selections
    const captainCounts = {};
    managerHistories.forEach(manager => {
        const captain = manager.currentTeam.picks.find(p => p.is_captain);
        if (captain) {
            const player = bootstrapData.elements.find(e => e.id === captain.element);
            captainCounts[player.web_name] = (captainCounts[player.web_name] || 0) + 1;
        }
    });

    // Sort by frequency
    const sortedCaptains = Object.entries(captainCounts)
        .sort((a, b) => b[1] - a[1]);

    if (captainInsights) {
        captainInsights.innerHTML = `
            <li>Most popular captain: ${sortedCaptains[0][0]} (${sortedCaptains[0][1]} managers)</li>
            <li>Total different captains: ${sortedCaptains.length}</li>
            <li>Other choices: ${sortedCaptains.slice(1, 3).map(c => `${c[0]} (${c[1]})`).join(', ')}</li>
        `;
    }
}

function updateSquadStructureAnalysis(managerHistories, bootstrapData) {
    const squadInsights = document.getElementById('squadStructureInsights');
    
    // Calculate average spend per position
    const positionSpend = managerHistories.map(manager => {
        const spend = {
            GKP: 0,
            DEF: 0,
            MID: 0,
            FWD: 0
        };
        
        manager.currentTeam.picks.forEach(pick => {
            const player = bootstrapData.elements.find(e => e.id === pick.element);
            spend[pick.position] += player.now_cost / 10;
        });
        
        return spend;
    });

    // Calculate averages
    const avgSpend = {
        GKP: (positionSpend.reduce((acc, curr) => acc + curr.GKP, 0) / positionSpend.length).toFixed(1),
        DEF: (positionSpend.reduce((acc, curr) => acc + curr.DEF, 0) / positionSpend.length).toFixed(1),
        MID: (positionSpend.reduce((acc, curr) => acc + curr.MID, 0) / positionSpend.length).toFixed(1),
        FWD: (positionSpend.reduce((acc, curr) => acc + curr.FWD, 0) / positionSpend.length).toFixed(1)
    };

    if (squadInsights) {
        squadInsights.innerHTML = `
            <li>Average budget allocation:</li>
            <li>Goalkeepers: £${avgSpend.GKP}m</li>
            <li>Defenders: £${avgSpend.DEF}m</li>
            <li>Midfielders: £${avgSpend.MID}m</li>
            <li>Forwards: £${avgSpend.FWD}m</li>
        `;
    }
}

// Add more helper functions...

async function generateGameweekSummary() {
    try {
        // Get references to all the insight sections
        const priceInsights = document.getElementById('priceInsights');
        const chipInsights = document.getElementById('chipInsights');
        const captainInsights = document.getElementById('captainInsights');
        const squadInsights = document.getElementById('squadStructureInsights');
        
        // Get template and differential counts
        const templateCount = document.getElementById('summaryTemplateCount').textContent;
        const diffCount = document.getElementById('summaryDifferentialCount').textContent;

        return `
            <div class="gameweek-summary-container">
                <div class="summary-section">
                    <p>Let's break down what we've learned from this week's analysis of the top 50 FPL managers. 
                    If you've skipped the detailed sections above, here's what you need to know:</p>

                    <p>The analysis has identified ${templateCount} highly-owned template players to choose from. 
                    Additionally, there are ${diffCount} differential options being considered by elite managers to gain an edge. 
                    Balancing selections from both pools is crucial for success.</p>

                    <p>Looking at their strategies:</p>
                    <ul class="action-points">
                        <li>Team Value: ${priceInsights.children[0].textContent}</li>
                        <li>Chip Strategy: ${chipInsights.children[0].textContent}</li>
                        <li>Captain Choices: ${captainInsights.children[0].textContent}</li>
                        <li>Squad Structure: ${squadInsights.children[1].textContent}, ${squadInsights.children[2].textContent}, 
                        ${squadInsights.children[3].textContent}, ${squadInsights.children[4].textContent}</li>
                    </ul>

                    <p><strong>Key Takeaway:</strong> Success at the highest level comes from making smart selections 
                    from both template and differential player pools. Elite managers typically select a mix of highly-owned 
                    template players for stability, while carefully choosing differentials from a pool of ${diffCount} options 
                    to gain rank advantages. Their squad structure and chip usage patterns demonstrate strategic long-term planning.</p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error generating gameweek summary:', error);
        return '<div class="error-message">Unable to generate gameweek summary. Please refresh the page.</div>';
    }
}

// Improve the forceRefresh function
function forceRefresh() {
    console.log("Force refreshing report data...");
    
    // Add a timestamp parameter to force browser to bypass cache
    const timestamp = new Date().getTime();
    
    // Clear all cached data
    localStorage.clear();
    sessionStorage.clear();
    
    // Show feedback to user
    const deadlineInfo = document.getElementById('deadlineInfo');
    if (deadlineInfo) {
        deadlineInfo.innerHTML = 'Refreshing data from FPL API...';
    }
    
    // Add a random parameter to the URL to force a complete refresh
    window.location.href = window.location.pathname + '?refresh=' + timestamp;
}

// Add a helper function to show refresh success
function showRefreshSuccess() {
    // Check if this is a force refresh
    if (window.location.search.includes('refresh=')) {
        console.log("This is a forced refresh - showing success message");
        
        // Add a success message that will fade out
        const successMessage = document.createElement('div');
        successMessage.className = 'refresh-success';
        successMessage.textContent = 'Data refreshed successfully!';
        document.body.appendChild(successMessage);
        
        // Fade out after 3 seconds
        setTimeout(() => {
            successMessage.style.opacity = '0';
            setTimeout(() => {
                successMessage.remove();
                
                // Clean up the URL
                history.replaceState({}, document.title, window.location.pathname);
            }, 500);
        }, 3000);
    }
}

// Add event listener for window load
window.addEventListener('load', function() {
    // Show success message if needed
    showRefreshSuccess();
    
    // Add refresh button to controls (we've removed this part)
}); 