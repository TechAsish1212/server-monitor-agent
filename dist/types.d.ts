export interface DockerStats {
    running: number;
    total: number;
}
export interface Metrics {
    cpu: number;
    memory: number;
    disk: number;
    uptime: string;
    docker: DockerStats;
    timestamp: string;
}
export interface AlertPayload {
    type: 'CPU' | 'Memory' | 'Disk';
    message: string;
    value: number;
}
export interface ServerToClientEvents {
    metrics: (data: Metrics) => void;
    alert: (data: AlertPayload) => void;
}
export interface ClientToServerEvents {
    requestMetrics: () => void;
}
