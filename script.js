async function fetchData() {
    const teamCount = document.getElementById('teamCount').value;
    const playerData = document.getElementById('playerData');
    playerData.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
        // Fetch general FPL data
        const response = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/');
        const data = await response.json();

        // Fetch top managers
        const leagueResponse = await fetch('https://fantasy.premierleague.com/api/leagues-classic/314/standings/');
        const leagueData = await leagueResponse.json();

        const topTeams = leagueData.standings.results.slice(0, teamCount);
        const playerCounts = {};

        // Fetch each team's players
        for (const team of topTeams) {
            const teamResponse = await fetch(`https://fantasy.premierleague.com/api/entry/${team.entry}/event/1/picks/`);
            const teamData = await teamResponse.json();
            
            teamData.picks.forEach(pick => {
                playerCounts[pick.element] = (playerCounts[pick.element] || 0) + 1;
            });
        }

        // Convert to array and sort by frequency
        const sortedPlayers = Object.entries(playerCounts)
            .map(([playerId, count]) => {
                const player = data.elements.find(p => p.id === parseInt(playerId));
                const team = data.teams.find(t => t.id === player.team);
                return {
                    name: player.web_name,
                    team: team.name,
                    price: (player.now_cost / 10).toFixed(1),
                    count: count,
                    percentage: ((count / teamCount) * 100).toFixed(1)
                };
            })
            .sort((a, b) => b.count - a.count);

        // Update table
        playerData.innerHTML = sortedPlayers
            .map(player => `
                <tr>
                    <td>${player.name}</td>
                    <td>${player.team}</td>
                    <td>£${player.price}</td>
                    <td>${player.count}</td>
                    <td>${player.percentage}%</td>
                </tr>
            `)
            .join('');

    } catch (error) {
        playerData.innerHTML = '<tr><td colspan="5">Error fetching data. Please try again.</td></tr>';
        console.error('Error:', error);
    }
} 