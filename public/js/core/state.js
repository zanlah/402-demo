import { api } from './api.js';

export const S = {
  state: null,
  messages: [],
  selected: null,
  openedAt: 0,
  plan: null,
  planError: null,
  runLog: [],
  running: false,
  data: {},
  mm: { balance: null, busy: null },
  importSource: null,
  importPreview: null,
  editGroup: null,
  campaignGroup: '',
  campaignName: '',
  pick: null, // uporabniki, izbrani za naslednji plan
};
export async function refreshState() {
  S.state = await api('/api/state');
}
