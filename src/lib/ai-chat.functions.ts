import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })),
  apiKey: z.string().min(1),
});

export const chatWithAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => messageSchema.parse(data))
  .handler(async ({ data }) => {
    const models = ["baidu/cobuddy:free", "openrouter/owl-alpha"];

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
            max_tokens: 4096,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Model ${model} failed: ${res.status} ${errText}`);
          continue;
        }

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "";
        return { content, model, error: null };
      } catch (err) {
        console.error(`Model ${model} error:`, err);
        continue;
      }
    }

    return { content: "", model: "", error: "All models unavailable. Check your API key." };
  });
