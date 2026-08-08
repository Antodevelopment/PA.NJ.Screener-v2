import { getStore } from "@netlify/blobs";

const defaultWeights = {
  underutilization: 30,
  regulatory: 25,
  motivation: 20,
  fit: 15,
  intelligence: 10,
};

type Outreach = {
  id: number;
  contactDate: string;
  parcelId: string;
  method: string;
  response: string;
  motivation: string;
  nextAction: string;
  rating: number;
};

type Workflow = {
  parcelId: string;
  stage: string;
  nextAction: string;
  updatedAt: string;
};

type AppState = {
  weights: Record<string, number>;
  logs: Outreach[];
  workflows: Workflow[];
};

const emptyState = (): AppState => ({ weights: defaultWeights, logs: [], workflows: [] });

function appStore() {
  return getStore({ name: "matts-deal-screener", consistency: "strong" });
}

async function readState(): Promise<AppState> {
  const saved = await appStore().get("state", { type: "json" }) as AppState | null;
  return saved ?? emptyState();
}

async function writeState(state: AppState) {
  await appStore().setJSON("state", state);
}

export async function GET() {
  return Response.json(await readState());
}

export async function POST(request: Request) {
  const body = await request.json() as {
    contactDate: string; parcelId: string; method: string; response: string;
    motivation: string; nextAction: string; rating: number; stage: string;
  };
  if (!body.parcelId || !body.response || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 || !["new", "screening", "pipeline", "passed"].includes(body.stage)) {
    return Response.json({ error: "Invalid outreach record" }, { status: 400 });
  }

  const state = await readState();
  const log: Outreach = {
    id: state.logs.reduce((largest, item) => Math.max(largest, item.id), 0) + 1,
    contactDate: body.contactDate, parcelId: body.parcelId, method: body.method,
    response: body.response, motivation: body.motivation, nextAction: body.nextAction,
    rating: body.rating,
  };
  const workflow: Workflow = {
    parcelId: body.parcelId, stage: body.stage, nextAction: body.nextAction,
    updatedAt: new Date().toISOString(),
  };
  state.logs.push(log);
  state.workflows = [...state.workflows.filter(item => item.parcelId !== body.parcelId), workflow];
  await writeState(state);
  return Response.json({ log, workflow }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as {
    type?: string; weights?: Record<string, number>; parcelId?: string;
    stage?: string; nextAction?: string;
  };
  const state = await readState();

  if (body.type === "workflow" && body.parcelId && body.stage && ["new", "screening", "pipeline", "passed"].includes(body.stage)) {
    const workflow: Workflow = {
      parcelId: body.parcelId, stage: body.stage, nextAction: body.nextAction || "",
      updatedAt: new Date().toISOString(),
    };
    state.workflows = [...state.workflows.filter(item => item.parcelId !== body.parcelId), workflow];
    await writeState(state);
    return Response.json({ workflow });
  }

  if (!body.weights || !Object.keys(body.weights).length) {
    return Response.json({ error: "No weights supplied" }, { status: 400 });
  }
  state.weights = body.weights;
  await writeState(state);
  return Response.json({ weights: state.weights });
}
