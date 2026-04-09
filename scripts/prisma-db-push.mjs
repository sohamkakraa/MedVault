#!/usr/bin/env node
import { runPrismaCli } from "./run-prisma-cli.mjs";

runPrismaCli(["db", "push"]);
