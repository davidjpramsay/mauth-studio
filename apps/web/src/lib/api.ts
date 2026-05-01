import type { GeneratedTest, Question } from "@mauth-studio/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

async function putJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

async function getJson<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

async function deleteRequest(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { method: "DELETE" });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
}

export function generateQuestion(type = "quadratic_factor", seed = 7) {
  return postJson<Question>("/api/questions/generate", { type, seed, formatting: "default", marking: "default" });
}

export function generateTest(seed = 20) {
  return postJson<GeneratedTest>("/api/tests/generate", {
    title: "High School Mathematics",
    questions: [
      { type: "quadratic_factor", count: 3 },
      { type: "differentiate_poly", count: 2 },
    ],
    formatting: "default",
    marking: "default",
    seed,
  });
}

export function listStoredTests<TSavedTest>() {
  return getJson<{ tests: TSavedTest[] }>("/api/storage/tests");
}

export function getStoredTest<TSavedTest>(testId: string) {
  return getJson<TSavedTest>(`/api/storage/tests/${encodeURIComponent(testId)}`);
}

export function saveStoredTest<TSavedTest>(test: TSavedTest & { id?: string }) {
  return test.id
    ? putJson<TSavedTest>(`/api/storage/tests/${encodeURIComponent(test.id)}`, test)
    : postJson<TSavedTest>("/api/storage/tests", test);
}

export function deleteStoredTest(testId: string) {
  return deleteRequest(`/api/storage/tests/${encodeURIComponent(testId)}`);
}

export function getStorageAutosave<TAutosave>() {
  return getJson<{ autosave: TAutosave | null }>("/api/storage/tests/autosave");
}

export function saveStorageAutosave<TAutosave>(autosave: TAutosave) {
  return postJson<{ autosave: TAutosave }>("/api/storage/tests/autosave", autosave);
}
