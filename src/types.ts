export interface DockerStats {
  running: number;
  total: number;
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

export interface ContainerInfo {
  name: string;
  status: string;
  image: string;
}

export interface DockerStats {
  running: number;
  total: number;
  containers: ContainerInfo[];
}

export interface Metrics {
  cpu: number;
  memory: number;
  disk: number;
  load_avg: number;      // NEW
  uptime: string;
  docker: DockerStats;
  timestamp: string;
}