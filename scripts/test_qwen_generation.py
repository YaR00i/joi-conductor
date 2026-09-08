"""Budget regressions without loading torch, a model, or a GPU.

Run: python -m unittest discover -s scripts -p test_qwen_generation.py
"""

import json
from pathlib import Path
import subprocess
import unittest

import qwen_tts_server as server


class QwenGenerationBudgetTest(unittest.TestCase):
    def test_short_utterances_keep_their_budget(self):
        self.assertEqual(server._cap_new_tokens("Hi"), 40)
        self.assertEqual(server._cap_new_tokens("Yeah, this is good, thanks!"), 78)

    def test_long_replies_and_explicit_budgets_in_both_device_modes(self):
        original = server.DEVICE_MODE
        try:
            for device in ("cpu", "cuda"):
                server.DEVICE_MODE = device
                with self.subTest(device=device):
                    self.assertEqual(server._gen_kw({}, "x" * 400)["max_new_tokens"], 824)
                    self.assertEqual(server._gen_kw({}, "я" * 900)["max_new_tokens"], 1824)
                    self.assertEqual(server._gen_kw({"max_new_tokens": 824}, "x" * 400)["max_new_tokens"], 824)
                    self.assertEqual(server._gen_kw({"max_new_tokens": 99999}, "Hi")["max_new_tokens"], 2048)
                    self.assertEqual(server._gen_kw({"max_new_tokens": 16}, "Hi")["max_new_tokens"], 16)
        finally:
            server.DEVICE_MODE = original

    def test_electron_and_python_stay_in_sync(self):
        samples = ["", "Hi", "  Привет!  ", "😀" * 50] + ["x" * n for n in (83, 84, 85, 100, 200, 400, 900, 1012, 2000)]
        script = """
import { qwenMaxNewTokens } from './electron/qwenLaunch.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
console.log(JSON.stringify(JSON.parse(input).map(qwenMaxNewTokens)));
"""
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=Path(__file__).resolve().parent.parent,
            input=json.dumps(samples), text=True, capture_output=True, check=True,
        )
        self.assertEqual(json.loads(result.stdout), [server._cap_new_tokens(text) for text in samples])


if __name__ == "__main__":
    unittest.main()
