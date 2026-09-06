const API_BASE_URL = '/api'

export interface GetConfigResponse {
  app_id: string
  token: string
  uid: string
  channel_name: string
  agent_uid: string
}

export async function getConfig(options?: { channel?: string; uid?: string | number }): Promise<GetConfigResponse> {
  const params = new URLSearchParams()
  if (options?.channel !== undefined && options.channel !== '') {
    params.set('channel', options.channel)
  }
  if (options?.uid !== undefined && options.uid !== '') {
    params.set('uid', String(options.uid))
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/get_config${query ? `?${query}` : ''}`, {
    method: 'GET',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data) {
    throw new Error(result.msg || 'Failed to get configuration')
  }
  return result.data
}

export interface IncidentFact {
  id: string
  text: string
  confidence: 'high' | 'medium' | 'low' | string
  evidence?: string | null
  timestamp: string
}

export interface IncidentHypothesis {
  id: string
  text: string
  status: 'unverified' | 'confirmed' | 'rejected' | string
  timestamp: string
}

export interface PendingAction {
  id: string
  title: string
  action: string
  target_resource: string
  risk_level: 'low' | 'medium' | 'high' | 'critical' | string
  details: string
  status: 'pending' | 'approved' | 'rejected' | 'completed' | string
  requested_at: string
  approved_by?: string | null
  rejected_reason?: string | null
}

export interface TimelineEvent {
  timestamp: string
  event: string
  category?: 'lifecycle' | 'fact' | 'hypothesis' | 'authorization' | 'action' | 'note' | string
  details: string
  metadata?: Record<string, any>
}

export interface Incident {
  id: string
  title: string
  service: string | null
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved'
  impact: string
  root_cause: string | null
  created_at: string
  updated_at: string
  facts?: IncidentFact[]
  hypotheses?: IncidentHypothesis[]
  pending_actions?: PendingAction[]
  notes: Array<{
    timestamp: string
    note: string
  }>
  timeline: TimelineEvent[]
}

export interface GetIncidentsResponse {
  success: boolean
  count: number
  incidents: Incident[]
}

export async function startAgent(channelName: string, rtcUid: number, userUid: number): Promise<string> {
  const payload = { channelName, rtcUid, userUid }

  const response = await fetch(`${API_BASE_URL}/startAgent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()
  if (result.code !== 0 || !result.data?.agent_id) {
    throw new Error(result.msg || 'Failed to start agent')
  }
  return result.data.agent_id
}

export async function stopAgent(agentId: string): Promise<void> {
  if (!agentId) return

  const response = await fetch(`${API_BASE_URL}/stopAgent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
}

export async function getIncidents(): Promise<GetIncidentsResponse> {
  const response = await fetch(`${API_BASE_URL}/incidents`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

export async function getIncident(incidentId: string): Promise<Incident> {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  const result = await response.json()

  if (!result.success || !result.incident) {
    throw new Error(result.error || 'Failed to get incident')
  }

  return result.incident
}

export async function approvePendingAction(
  incidentId: string,
  actionId: string,
  approvedBy: string = 'Incident Lead'
): Promise<{ success: boolean; action: PendingAction; message: string }> {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/actions/${actionId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved_by: approvedBy }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

export async function rejectPendingAction(
  incidentId: string,
  actionId: string,
  reason: string = 'Rejected by human operator.'
): Promise<{ success: boolean; action: PendingAction; message: string }> {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/actions/${actionId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

export interface ServiceHealth {
  name: string
  status: string
  error_rate: string
  latency: string
  description?: string
}

export interface GetServiceHealthResponse {
  success: boolean
  services: ServiceHealth[]
}

export async function getServiceHealth(): Promise<GetServiceHealthResponse> {
  const response = await fetch(`${API_BASE_URL}/services/health`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

export interface PostMortemResponse {
  success: boolean
  incident_id?: string
  status?: string
  markdown?: string
  error?: string
}

export async function getPostMortem(incidentId: string): Promise<PostMortemResponse> {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/postmortem`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || error.error || `HTTP ${response.status}`)
  }

  return response.json()
}