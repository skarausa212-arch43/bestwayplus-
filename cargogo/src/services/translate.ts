import { ChatLang } from '@/types';

/**
 * Автоперевод свободного текста чата (§ Шаг 2.5.2).
 * Быстрые фразы переводятся словарём мгновенно; сюда попадает только свободный текст.
 *
 * В production вызов идёт через СВОЙ сервер (ключ не хранится в приложении — §59).
 * Для локальной демо можно передать ключ через переменную окружения
 * EXPO_PUBLIC_ANTHROPIC_KEY при запуске `expo start`.
 * Без ключа/сети перевод тихо отключается — сообщение остаётся оригиналом (как в прототипе).
 */
const API_KEY: string = (globalThis as any)?.process?.env?.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';

export async function translateMessage(text: string): Promise<Record<ChatLang, string> | null> {
  if (!API_KEY) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        // Прямой вызов из приложения — только для демо; в production заменить на свой backend
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: 'Translate this chat message into Polish, Russian and English. '
            + 'Reply ONLY with JSON like {"pl":"...","ru":"...","en":"..."} and nothing else. '
            + 'Message: ' + JSON.stringify(text),
        }],
      }),
    });
    const data = await resp.json();
    const raw = (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (parsed.pl && parsed.ru && parsed.en) return { pl: parsed.pl, ru: parsed.ru, en: parsed.en };
    return null;
  } catch {
    return null; // фолбэк: показываем оригинал
  }
}
