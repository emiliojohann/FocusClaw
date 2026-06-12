declare module 'openclaw/plugin-sdk/plugin-entry' {
  export interface OpenClawToolDefinition {
    name: string
    description: string
    parameters: unknown
    execute: (id: unknown, params: any, context: { pluginConfig?: unknown }) => Promise<unknown>
  }

  export interface OpenClawPluginApi {
    registerTool(tool: OpenClawToolDefinition): void
  }

  export function definePluginEntry(definition: {
    id: string
    name: string
    description: string
    register(api: OpenClawPluginApi): void
  }): unknown
}
