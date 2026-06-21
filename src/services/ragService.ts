// RAG service — proxies through backend for embedding + similarity search
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

class RagService {
  async query(question: string, sessionId: string): Promise<string> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, sessionId, topK: 5 }),
      });

      if (!response.ok) return '';
      const data = await response.json();
      return (data.context as string) ?? '';
    } catch {
      return '';
    }
  }

  async ingestDocument(
    fileUri: string,
    filename: string,
    sessionId: string,
    moduleTag?: string
  ): Promise<{ docId: string; chunkCount: number }> {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: filename,
      type: 'application/pdf',
    } as any);
    formData.append('sessionId', sessionId);
    if (moduleTag) formData.append('moduleTag', moduleTag);

    const response = await fetch(`${BACKEND_URL}/api/rag/ingest`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ingest failed: ${response.status} — ${err}`);
    }

    return response.json();
  }

  async listDocs(sessionId: string): Promise<{ id: string; filename: string; chunkCount: number }[]> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rag/docs?sessionId=${sessionId}`);
      if (!response.ok) return [];
      return response.json();
    } catch {
      return [];
    }
  }

  async deleteDoc(docId: string): Promise<void> {
    await fetch(`${BACKEND_URL}/api/rag/docs/${docId}`, { method: 'DELETE' });
  }
}

export const ragService = new RagService();
