import { githubStarsResponse, type StarEnvironment } from "../../cloudflare/github-stars";

export const onRequestGet = ({ env }: { env: StarEnvironment }) => githubStarsResponse(env);
