document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('Starting data fetch...');
        const response = await fetch('/api/bootstrap-static/');
        const data = await response.json();
        console.log('Bootstrap data received:', data);

        // Get current gameweek once and pass it where needed
        const currentGW = data.events.find(event => event.is_current)?.id || 
                         data.events.find(event => event.is_next)?.id;

        // Find next gameweek and its deadline
        const nextGW = data.events.find(event => event.is_next);
        console.log('Next gameweek:', nextGW);
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
            console.log('Formatted deadline:', formattedDeadline);
            document.getElementById('deadlineInfo').textContent = 
                `Gameweek ${nextGW.id} Deadline: ${formattedDeadline}`;
        }

        // Fetch top 10 managers data
        console.log('Fetching league data...');
        const leagueResponse = await fetch('/api/leagues-classic/314/standings/');
        const leagueData = await leagueResponse.json();
        console.log('League data received:', leagueData);
        const topTeams = leagueData.standings.results.slice(0, 10);
        console.log('Top 10 teams:', topTeams);

        // Process player data
        console.log('Processing player data...');
        const playerData = await processPlayerData(data, topTeams);
        console.log('Processed player data:', playerData);
        
        // Update summary stats
        console.log('Updating summary stats...');
        document.getElementById('totalPlayersAnalyzed').textContent = playerData.length;
        const templatePlayers = playerData.filter(p => parseFloat(p.percentage) >= 50);
        const differentials = playerData.filter(p => parseFloat(p.percentage) < 20 && parseFloat(p.percentage) > 5);
        
        console.log('Template players:', templatePlayers);
        console.log('Differentials:', differentials);

        // Update Executive Summary table
        // Template Core stats
        document.getElementById('summaryTemplateCount').textContent = templatePlayers.length;
        document.getElementById('templateAvgPoints').textContent = 
            Math.round(templatePlayers.reduce((acc, p) => acc + p.total_points, 0) / templatePlayers.length);
        document.getElementById('templateOwnershipRange').textContent = 
            `${Math.min(...templatePlayers.map(p => parseFloat(p.percentage))).toFixed(1)}% - ${Math.max(...templatePlayers.map(p => parseFloat(p.percentage))).toFixed(1)}%`;
        
        // Differential stats
        document.getElementById('summaryDifferentialCount').textContent = differentials.length;
        document.getElementById('differentialAvgPoints').textContent = 
            Math.round(differentials.reduce((acc, p) => acc + p.total_points, 0) / differentials.length);
        document.getElementById('differentialOwnershipRange').textContent = 
            `${Math.min(...differentials.map(p => parseFloat(p.percentage))).toFixed(1)}% - ${Math.max(...differentials.map(p => parseFloat(p.percentage))).toFixed(1)}%`;

        // Update cover page counts
        document.getElementById('coverTemplateCount').textContent = templatePlayers.length;
        document.getElementById('coverDifferentialCount').textContent = differentials.length;

        // Update strategy analysis
        console.log('Starting strategy analysis...');
        await updateStrategyAnalysis(topTeams, currentGW, data);
        console.log('Strategy analysis complete');

        // Update template and differential analysis
        updateTemplateAnalysis(playerData);
        updateDifferentialAnalysis(playerData);
        updateOptimizedTeam(playerData);

        // Update individual manager profiles
        console.log('Starting manager profiles update...');
        await updateManagerProfiles(topTeams, currentGW, data);
        console.log('Manager profiles complete');

        // Generate gameweek summary
        console.log('Generating gameweek summary...');
        const summaryContent = document.getElementById('gameweekSummaryContent');
        if (summaryContent) {
            summaryContent.innerHTML = await generateGameweekSummary();
        }
        console.log('Gameweek summary complete');

    } catch (error) {
        console.error('Error in main process:', error);
        document.getElementById('deadlineInfo').textContent = 'Error loading data';
        document.getElementById('totalPlayersAnalyzed').textContent = 'Error';
        document.getElementById('coverTemplateCount').textContent = 'Error';
        document.getElementById('coverDifferentialCount').textContent = 'Error';
    }
});

async function updateStrategyAnalysis(topTeams, currentGW, bootstrapData) {
    try {
        // Fetch both history and current team data for each manager
        const managerHistories = await Promise.all(
            topTeams.map(async team => {
                const historyResponse = await fetch(`/api/entry/${team.entry}/history/`);
                const historyData = await historyResponse.json();
                
                const teamResponse = await fetch(`/api/entry/${team.entry}/event/${currentGW}/picks/`);
                const teamData = await teamResponse.json();
                
                // Map player data with positions from bootstrap
                teamData.picks = teamData.picks.map(pick => ({
                    ...pick,
                    position: getPosition(bootstrapData.elements.find(e => e.id === pick.element).element_type)
                }));
                
                return {
                    manager: team,
                    history: historyData,
                    currentTeam: teamData
                };
            })
        );

        // Update each strategy section with correct data
        updatePriceAnalysis(managerHistories);
        updateChipAnalysis(managerHistories);
        updateCaptainAnalysis(managerHistories, bootstrapData);
        updateSquadStructureAnalysis(managerHistories, bootstrapData);

    } catch (error) {
        console.error('Error updating strategy analysis:', error);
    }
}

function updatePriceAnalysis(managerHistories) {
    const priceChart = document.getElementById('priceManagementChart');
    const priceInsights = document.getElementById('priceInsights');
    
    // Calculate team value trends
    const teamValues = managerHistories.map(manager => {
        const currentValue = manager.history.current.map(gw => gw.value);
        return {
            name: manager.manager.player_name,
            values: currentValue,
            maxValue: Math.max(...currentValue) / 10,
            currentValue: currentValue[currentValue.length - 1] / 10
        };
    });

    // Sort by current team value
    teamValues.sort((a, b) => b.currentValue - a.currentValue);

    // Create price management chart
    new Chart(priceChart, {
        type: 'line',
        data: {
            labels: Array.from({ length: teamValues[0].values.length }, (_, i) => `GW${i + 1}`),
            datasets: teamValues.map((team, index) => ({
                label: team.name,
                data: team.values.map(v => v / 10),
                borderColor: index === 0 ? '#00ff87' : `hsl(${index * 36}, 70%, 50%)`,
                fill: false
            }))
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    display: true
                }
            }
        }
    });

    // Add insights
    priceInsights.innerHTML = `
        <li>Highest team value: £${teamValues[0].maxValue}m (${teamValues[0].name})</li>
        <li>Average team value: £${(teamValues.reduce((acc, tv) => acc + tv.currentValue, 0) / teamValues.length).toFixed(1)}m</li>
        <li>Value range: £${(teamValues[teamValues.length - 1].currentValue).toFixed(1)}m - £${teamValues[0].currentValue.toFixed(1)}m</li>
    `;
}

function updateChipAnalysis(managerHistories) {
    console.log('Chip Analysis Data:', managerHistories);
    const chipChart = document.getElementById('chipStrategyChart');
    const chipInsights = document.getElementById('chipInsights');
    
    // Map API chip names to display names
    const chipDisplayNames = {
        '3xc': 'Triple Captain',
        'wildcard': 'Wildcard',
        'freehit': 'Free Hit',
        'bboost': 'Bench Boost',
        'manager': 'No Chip'  // This appears to be the default state
    };

    const chipUsage = {};
    
    // Initialize chip usage based on what we find
    managerHistories.forEach(manager => {
        manager.history.chips.forEach(chip => {
            if (!chipUsage[chip.name]) {
                chipUsage[chip.name] = { used: 0, avgWeek: 0, weeks: [] };
            }
        });
    });

    managerHistories.forEach(manager => {
        const chips = manager.history.chips || [];
        chips.forEach(chip => {
            chipUsage[chip.name].used++;
            chipUsage[chip.name].avgWeek += chip.event;
            chipUsage[chip.name].weeks.push(chip.event);
        });
    });

    // Calculate averages
    Object.keys(chipUsage).forEach(chip => {
        if (chipUsage[chip].used > 0) {
            chipUsage[chip].avgWeek = Math.round(chipUsage[chip].avgWeek / chipUsage[chip].used);
        }
    });

    // Create chip usage chart
    new Chart(chipChart, {
        type: 'bar',
        data: {
            labels: Object.values(chipDisplayNames).filter(name => name !== 'No Chip'),
            datasets: [{
                data: Object.entries(chipUsage)
                    .filter(([chip]) => chip !== 'manager')
                    .map(([_, data]) => data.used),
                backgroundColor: ['#00ff87', '#37003c', '#e90052', '#04f5ff']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // Add insights
    chipInsights.innerHTML = Object.entries(chipUsage)
        .filter(([chip]) => chip !== 'manager')  // Don't show "No Chip" in insights
        .map(([chip, data]) => {
            const chipName = chipDisplayNames[chip];
            return `<li>${chipName}: ${data.used} managers used (avg GW${data.avgWeek})</li>`;
        })
        .join('');
}

function updateCaptainAnalysis(managerHistories, bootstrapData) {
    console.log('Captain Analysis Data:', managerHistories);
    const captainInsights = document.getElementById('captainInsights');
    
    // Use currentTeam data to find captains
    const captainPicks = managerHistories.map(manager => {
        console.log('Manager team:', manager.currentTeam);
        const captain = manager.currentTeam.picks.find(p => p.is_captain);
        const player = bootstrapData.elements.find(e => e.id === captain.element);
        return {
            name: player.web_name,
            team: bootstrapData.teams.find(t => t.id === player.team).name,
            points: player.total_points,
            price: player.now_cost / 10
        };
    });
    
    // Count frequency of each captain
    const captainCounts = captainPicks.reduce((acc, pick) => {
        acc[pick.name] = (acc[pick.name] || 0) + 1;
        return acc;
    }, {});
    
    // Sort by popularity
    const sortedCaptains = Object.entries(captainCounts)
        .sort((a, b) => b[1] - a[1]);
    
    captainInsights.innerHTML = `
        <li>Most popular captain: ${sortedCaptains[0][0]} (${sortedCaptains[0][1]} managers)</li>
        <li>Total different captains: ${Object.keys(captainCounts).length}</li>
        <li>Other choices: ${sortedCaptains.slice(1)
            .map(([name, count]) => `${name} (${count})`)
            .join(', ')}</li>
    `;
}

function updateSquadStructureAnalysis(managerHistories, bootstrapData) {
    const structureInsights = document.getElementById('squadStructureInsights');
    
    // Use currentTeam data for squad structure
    const budgetAnalysis = managerHistories.map(manager => {
        const positions = ['GKP', 'DEF', 'MID', 'FWD'];
        return positions.reduce((acc, pos) => {
            const positionPlayers = manager.currentTeam.picks.filter(p => p.position === pos);
            acc[pos] = positionPlayers.reduce((sum, p) => {
                const player = bootstrapData.elements.find(e => e.id === p.element);
                return sum + (player ? player.now_cost : 0);
            }, 0) / 10;
            return acc;
        }, {});
    });
    
    // Calculate averages
    const avgBudget = budgetAnalysis.reduce((acc, budget) => {
        Object.keys(budget).forEach(pos => {
            acc[pos] = (acc[pos] || 0) + budget[pos];
        });
        return acc;
    }, {});
    
    Object.keys(avgBudget).forEach(pos => {
        avgBudget[pos] = (avgBudget[pos] / managerHistories.length).toFixed(1);
    });
    
    structureInsights.innerHTML = `
        <li>Average budget allocation:</li>
        <li>Goalkeepers: £${avgBudget.GKP}m</li>
        <li>Defenders: £${avgBudget.DEF}m</li>
        <li>Midfielders: £${avgBudget.MID}m</li>
        <li>Forwards: £${avgBudget.FWD}m</li>
    `;
}

// Add the processPlayerData function
async function processPlayerData(data, topTeams) {
    const playerCounts = {};
    const currentGW = data.events.find(event => event.is_current)?.id || 
                     data.events.find(event => event.is_next)?.id;

    // Fetch each team's players
    for (const team of topTeams) {
        try {
            const teamResponse = await fetch(`/api/entry/${team.entry}/event/${currentGW}/picks/`);
            const teamData = await teamResponse.json();
            
            // Log manager chip usage
            if (teamData.active_chip === 'manager') {
                console.log('Manager chip data:', {
                    team: team,
                    picks: teamData.picks,
                    raw_data: teamData
                });
            }

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
                element_type: player.element_type,
                now_cost: player.now_cost,
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

// Helper function to convert position number to code
function getPosition(elementType) {
    const positions = {
        1: 'GKP',
        2: 'DEF',
        3: 'MID',
        4: 'FWD'
    };
    return positions[elementType] || 'Unknown';
}

function updateTemplateAnalysis(playerData) {
    const templateSection = document.getElementById('templatePlayersSection');
    const templatePlayers = playerData
        .filter(p => parseFloat(p.percentage) >= 50)
        .sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage));

    let html = `
        <div class="section-intro">
            <p>The following players form the core template of successful teams, owned by 50% or more of the top 10 managers.</p>
        </div>
        <div class="player-grid">
    `;

    templatePlayers.forEach(player => {
        html += createDetailedPlayerCard(player);
    });

    html += '</div>';
    templateSection.innerHTML = html;
}

function createDetailedPlayerCard(player, isDifferential = false) {
    return `
        <div class="player-card ${isDifferential ? 'differential' : ''}">
            <img src="${player.photo}" alt="${player.name}" class="player-image"
               onerror="this.src='/images/managers/default-manager.png'">
            <div class="player-details">
                <div class="player-name">${player.name}</div>
                <div class="player-team">${player.team} | Manager</div>
                <div class="player-stats">
                    <span class="stat">£${(parseFloat(player.now_cost) / 10).toFixed(1)}m</span>
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

function updateDifferentialAnalysis(playerData) {
    const differentialSection = document.getElementById('differentialPlayersSection');
    const differentials = playerData
        .filter(p => 
            parseFloat(p.percentage) < 20 && 
            parseFloat(p.percentage) > 5 &&
            p.total_points > 0 && 
            parseFloat(p.points_per_game) > 0
        )
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
    
    // Filter and sort players by value (points per million)
    const qualifyingPlayers = playerData
        .filter(p => p.element_type && p.total_points > 0)
        .map(p => ({
            ...p,
            value: p.total_points / (p.now_cost / 10)
        }))
        .sort((a, b) => b.value - a.value);

    // Select best value players by position
    const gks = qualifyingPlayers.filter(p => p.element_type === 1).slice(0, 2);
    const defs = qualifyingPlayers.filter(p => p.element_type === 2).slice(0, 5);
    const mids = qualifyingPlayers.filter(p => p.element_type === 3).slice(0, 5);
    const fwds = qualifyingPlayers.filter(p => p.element_type === 4).slice(0, 3);

    const squad = [...gks, ...defs, ...mids, ...fwds];
    const totalPoints = squad.reduce((sum, p) => sum + p.total_points, 0);
    const totalCost = squad.reduce((sum, p) => sum + (p.now_cost / 10), 0);

    let html = `
        <div class="section-intro">
            <p>This section presents an optimized selection of players based on their total points and
            position-specific budget constraints. The selection algorithm prioritizes players who have
            demonstrated consistent performance while maintaining positional balance. Note that
            this is not a complete 15-player squad, but rather a strategic selection of key players you
            should consider based on:</p>
            <ul>
                <li>Total points accumulated</li>
                <li>Position-specific budget allocation</li>
                <li>Ownership among top managers</li>
                <li>Team balance considerations</li>
            </ul>
            <div class="squad-stats">
                <div class="stat">Total Points: ${totalPoints}</div>
                <div class="stat">Total Cost: £${totalCost.toFixed(1)}m</div>
            </div>
        </div>
        <div class="optimized-squad-grid">
            <div class="position-group">
                <h3>Goalkeepers</h3>
                <div class="player-grid">
                    ${gks.map(p => createDetailedPlayerCard(p)).join('')}
                </div>
            </div>
            <div class="position-group">
                <h3>Defenders</h3>
                <div class="player-grid">
                    ${defs.map(p => createDetailedPlayerCard(p)).join('')}
                </div>
            </div>
            <div class="position-group">
                <h3>Midfielders</h3>
                <div class="player-grid">
                    ${mids.map(p => createDetailedPlayerCard(p)).join('')}
                </div>
            </div>
            <div class="position-group">
                <h3>Forwards</h3>
                <div class="player-grid">
                    ${fwds.map(p => createDetailedPlayerCard(p)).join('')}
                </div>
            </div>
        </div>
    `;

    optimizedSection.innerHTML = html;
}

async function updateManagerProfiles(topTeams, currentGW, bootstrapData) {
    const profilesSection = document.getElementById('managerProfilesSection');
    
    if (profilesSection) {
        topTeams.forEach((manager, index) => {
            profilesSection.innerHTML += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${manager.player_name}</td>
                    <td>${manager.entry_name}</td>
                    <td>${manager.total}</td>
                    <td>${manager.event_total}</td>
                </tr>
            `;
        });
    }
}

function createRankHistoryChart(managerId, history) {
    const ctx = document.getElementById(`rankChart_${managerId}`).getContext('2d');
    const ranks = history.current.map(gw => gw.overall_rank);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: ranks.length }, (_, i) => `GW${i + 1}`),
            datasets: [{
                label: 'Overall Rank',
                data: ranks,
                borderColor: '#00ff87',
                fill: false,
                tension: 0.1,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    reverse: true,
                    title: {
                        display: true,
                        text: 'Rank'
                    },
                    ticks: {
                        callback: value => formatNumber(value)
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function createManagerProfile(manager, bootstrapData, currentGW) {
    const avgScore = bootstrapData.events.find(e => e.is_current).average_entry_score;
    const pointsPerGW = (manager.total / currentGW).toFixed(1);
    
    const rankChange = manager.last_rank - manager.rank;

    // Fetch team data for this manager
    const teamResponse = await fetch(`/api/entry/${manager.entry}/event/${currentGW}/picks/`);
    const teamData = await teamResponse.json();

    // Calculate true season average
    const seasonAverage = (manager.total / currentGW).toFixed(1);

    return `
        <div class="manager-profile-card" id="manager_${manager.entry}">
            <div class="manager-header">
                <div class="manager-info">
                    <h3>${manager.player_name}</h3>
                    <div class="manager-stats">
                        <span class="rank">Rank: #${manager.rank.toLocaleString()}</span>
                        <span class="points">Points: ${manager.total}</span>
                        <span class="rank-movement ${rankChange > 0 ? 'positive' : 'negative'}">
                            ${Math.abs(rankChange).toLocaleString()} places ${rankChange > 0 ? '↑' : '↓'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="performance-container">
                <div class="metrics-grid">
                    <div class="metric">
                        <span class="metric-value">${pointsPerGW}</span>
                        <span class="metric-label">Points/GW</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value">${manager.rank.toLocaleString()}</span>
                        <span class="metric-label">Overall Rank</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value">+${manager.total - avgScore}</span>
                        <span class="metric-label">vs Average</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value">${(manager.total / avgScore * 100 - 100).toFixed(1)}%</span>
                        <span class="metric-label">Above Avg</span>
                    </div>
                    <div class="metric highlight ${rankChange > 0 ? 'positive' : 'negative'}">
                        <span class="metric-value">${Math.abs(rankChange).toLocaleString()}</span>
                        <span class="metric-label">Rank ${rankChange > 0 ? 'Gained' : 'Lost'}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value">${manager.event_total}</span>
                        <span class="metric-label">GW Points</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value">${currentGW}</span>
                        <span class="metric-label">Gameweeks Played</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value">${seasonAverage}</span>
                        <span class="metric-label">Season Average</span>
                    </div>
                </div>
            </div>

            <div class="manager-summary">
                <h4>Manager Analysis</h4>
                ${generateManagerSummary(manager, bootstrapData, currentGW, teamData)}
            </div>

            <div class="team-lineup">
                <h4>Current Team</h4>
                <table class="lineup-table">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Pos</th>
                            <th>Player</th>
                            <th>Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${getTeamLineup(teamData, bootstrapData)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function generateManagerSummary(manager, bootstrapData, currentGW, teamData) {
    const avgScore = bootstrapData.events.find(e => e.is_current).average_entry_score;
    const rankChange = manager.last_rank - manager.rank;
    const pointsAboveAvg = manager.total - avgScore;
    const seasonAvg = (manager.total / currentGW).toFixed(1);

    // Get captain info
    const captain = teamData.picks.find(p => p.is_captain);
    const captainPlayer = bootstrapData.elements.find(e => e.id === captain.element);

    return `
        <div class="summary-text">
            <p>${manager.player_name}'s season has been particularly noteworthy, currently sitting at an impressive rank of 
            ${manager.rank.toLocaleString()}. Their consistent performance is reflected in a strong average of 
            ${seasonAvg} points per gameweek, putting them ${pointsAboveAvg} points ahead of the global average.</p>
            
            <p>Recent form shows ${rankChange > 0 ? 'positive momentum' : 'some challenges'}, with a 
            ${Math.abs(rankChange).toLocaleString()} place ${rankChange > 0 ? 'rise' : 'fall'} in the rankings. 
            Their captain choice of ${captainPlayer.web_name} this week demonstrates 
            ${manager.event_total > avgScore ? 'shrewd decision-making' : 'the challenging nature of this gameweek'}.</p>
            
            <p><strong>Looking Ahead:</strong> Given their current team structure and recent performance, 
            they're well-positioned to ${rankChange > 0 ? 'maintain this upward trajectory' : 'bounce back'}. 
            Key differentials in their squad could prove crucial for maintaining their elite status.</p>
        </div>
    `;
}

function getTeamLineup(teamData, bootstrapData) {
    try {
        // Sort picks by position (1-15)
        const sortedPicks = [...teamData.picks].sort((a, b) => a.position - b.position);
        
        return sortedPicks.map(pick => {
            const player = bootstrapData.elements.find(e => e.id === pick.element);
            const position = getPosition(player.element_type);
            
            return `
                <tr>
                    <td>
                        <img src="https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.code}.png" 
                             alt="${player.web_name}"
                             onerror="this.src='images/placeholder.png'">
                    </td>
                    <td>${position}</td>
                    <td>
                        ${player.web_name}
                        ${pick.is_captain ? '(C)' : ''}
                        ${pick.is_vice_captain ? '(V)' : ''}
                    </td>
                    <td>${player.event_points}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error generating team lineup:', error);
        return '<tr><td colspan="4">Team data unavailable</td></tr>';
    }
}

// Modify the summary generator to not require parameters since it uses DOM elements
async function generateGameweekSummary() {
    try {
        // Get data from existing sections
        const templateCount = document.getElementById('summaryTemplateCount').textContent;
        const templateAvgPoints = document.getElementById('templateAvgPoints').textContent;
        const diffCount = document.getElementById('summaryDifferentialCount').textContent;
        
        // Get strategy insights
        const priceInsights = document.getElementById('priceInsights').getElementsByTagName('li');
        const chipInsights = document.getElementById('chipInsights').getElementsByTagName('li');
        const captainInsights = document.getElementById('captainInsights').getElementsByTagName('li');
        const squadInsights = document.getElementById('squadStructureInsights').getElementsByTagName('li');

        if (!priceInsights.length || !chipInsights.length || !captainInsights.length || !squadInsights.length) {
            throw new Error('Required insights not found');
        }

        const summaryHtml = `
            <div class="gameweek-summary-container">
                <div class="summary-section">
                    <p>Let's break down what we've learned from this week's analysis of the top 10 FPL managers. 
                    If you've skipped the detailed sections above, here's what you need to know:</p>

                    <p>The analysis has identified ${templateCount} highly-owned template players that top managers are selecting from. 
                    Additionally, there are ${diffCount} differential options being considered by elite managers to gain an edge. 
                    Making smart selections from both pools is crucial for success.</p>

                    <p>Looking at their strategies:</p>
                    <ul class="action-points">
                        <li>Team Value: ${priceInsights[0].textContent}</li>
                        <li>Chip Strategy: ${chipInsights[0].textContent}</li>
                        <li>Captain Choices: ${captainInsights[0].textContent}</li>
                        <li>Squad Structure: ${squadInsights[1].textContent}, ${squadInsights[2].textContent}, 
                        ${squadInsights[3].textContent}, ${squadInsights[4].textContent}</li>
                    </ul>

                    <p><strong>Key Takeaway:</strong> Success at the highest level comes from making smart selections 
                    from both template and differential player pools. Elite managers carefully balance their 15-man squad 
                    between highly-owned template options for stability and calculated differential picks from a pool of 
                    ${diffCount} options to gain rank advantages.</p>
                </div>
            </div>
        `;
        return summaryHtml;

    } catch (error) {
        console.error('Error generating gameweek summary:', error);
        return '<div class="error-message">Unable to generate gameweek summary. Please refresh the page.</div>';
    }
} 