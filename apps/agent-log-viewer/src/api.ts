import type { FileContent, ProjectDetail, ProjectsResponse } from './shared/types';

function buildQuery(roots: string[]): string {
  const params = new URLSearchParams();
  if (roots.length > 0) {
    params.set('roots', roots.join(','));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function fetchProjects(roots: string[]): Promise<ProjectsResponse> {
  const response = await fetch(`/api/projects${buildQuery(roots)}`);
  if (!response.ok) {
    throw new Error('Unable to load projects.');
  }
  return response.json() as Promise<ProjectsResponse>;
}

export async function fetchProjectDetail(projectId: string, roots: string[]): Promise<ProjectDetail> {
  const response = await fetch(`/api/projects/${projectId}${buildQuery(roots)}`);
  if (!response.ok) {
    throw new Error('Unable to load project detail.');
  }
  return response.json() as Promise<ProjectDetail>;
}

export async function fetchFileContent(
  projectId: string,
  fileKey: string,
  roots: string[]
): Promise<FileContent> {
  const response = await fetch(`/api/projects/${projectId}/files/${fileKey}${buildQuery(roots)}`);
  if (!response.ok) {
    throw new Error('Unable to load file content.');
  }
  return response.json() as Promise<FileContent>;
}
