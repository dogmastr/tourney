export function getRoundRobinRequiredRounds(activePlayerCount: number): number {
    if (activePlayerCount < 2) return 0;
    return activePlayerCount % 2 === 0 ? activePlayerCount - 1 : activePlayerCount;
}

export function getRoundRobinMaxPlayers(maxRounds: number): number {
    if (maxRounds <= 0) return 0;
    return maxRounds % 2 === 0 ? maxRounds : maxRounds + 1;
}
