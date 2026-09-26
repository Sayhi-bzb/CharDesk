import { githubStarsResponse, type StarEnvironment } from "@chardesk/github-stars";

export const onRequestGet = ({ env }: { env: StarEnvironment }) => githubStarsResponse(env);
