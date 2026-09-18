/* Preload: register the panet resolver hook */
import { register } from 'node:module'
register('./panet-resolver.mjs', import.meta.url)
