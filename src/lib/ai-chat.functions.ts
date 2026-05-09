import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

export const chatWithAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => messageSchema.parse(data))
  .handler(async ({ data }) => {
    const models = data.model
      ? [data.model, "baidu/cobuddy:free", "openrouter/owl-alpha"]
      : ["baidu/cobuddy:free", "openrouter/owl-alpha"];

    for (const model of models) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: data.messages,
            max_tokens: 32000,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Model ${model} failed: ${res.status} ${errText}`);
          continue;
        }

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "";
        const finishReason = json.choices?.[0]?.finish_reason || null;
        return { content, model, finishReason, error: null };
      } catch (err) {
        console.error(`Model ${model} error:`, err);
        continue;
      }
    }

    return { content: "", model: "", finishReason: null, error: "All models unavailable. Check your API key." };
  });
