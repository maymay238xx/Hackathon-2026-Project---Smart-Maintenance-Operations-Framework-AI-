"""Build Agent using Microsoft Agent Framework in Python
# Run this python script
> pip install agent-framework==1.0.0rc6
> python <this-script-path>.py
"""

import asyncio

from agent_framework import Agent, tool
from agent_framework.openai import OpenAIChatClient
from azure.identity.aio import DefaultAzureCredential

# Microsoft Foundry Agent Configuration
ENDPOINT = "https://hackathon-agents-resource.openai.azure.com"
MODEL_DEPLOYMENT_NAME = "gpt-4o"

AGENT_NAME = "ai-agent"
AGENT_INSTRUCTIONS = "You are a helpful AI assistant."

# User inputs for the conversation
USER_INPUTS = [
    "INSERT_INPUT_HERE",
]

async def main() -> None:
    async with Agent(
        client=OpenAIChatClient(
            azure_endpoint=ENDPOINT,
            model=MODEL_DEPLOYMENT_NAME,
            # For authentication, DefaultAzureCredential supports multiple authentication methods. Run `az login` in terminal for Azure CLI auth.
            credential=DefaultAzureCredential(),
        ),
        name=AGENT_NAME,
        instructions=AGENT_INSTRUCTIONS,
        default_options={
            "max_tokens":4096,
        },
        tools=None,
    ) as agent:

        # Process user messages
        for user_input in USER_INPUTS:
            print(f"\n# User: '{user_input}'")
            printed_tool_calls = set()
            async for chunk in agent.run([user_input], stream=True):
                # log tool calls if any
                function_calls = [
                    c for c in chunk.contents 
                    if c.type == "function_call"
                ]
                for call in function_calls:
                    if call.call_id not in printed_tool_calls:
                        print(f"Tool calls: {call.name}")
                        printed_tool_calls.add(call.call_id)
                if chunk.text:
                    print(chunk.text, end="")
            print("")
        
        print("\n--- All tasks completed successfully ---")

    # Give additional time for all async cleanup to complete
    await asyncio.sleep(1.0)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nProgram interrupted by user")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("Program finished.")
