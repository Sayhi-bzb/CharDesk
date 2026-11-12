import { manualEntries } from '../content';
export async function loader() { return Response.json(await manualEntries()); }
