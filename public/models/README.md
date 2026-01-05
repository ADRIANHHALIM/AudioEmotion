# Emotion Model Directory

Place your ONNX emotion recognition model here.

## Expected Model

**Filename:** `emotion_model.onnx`

**Input:**

- Name: `input_values` (or first input)
- Shape: `[batch_size, sequence_length]`
- Type: `float32`
- Audio samples at 16kHz sample rate

**Output:**

- Name: `logits` (or first output)
- Shape: `[batch_size, 8]`
- Type: `float32`
- Raw logits for 8 emotion classes

**Emotion Classes (in order):**

1. angry
2. fearful
3. sad
4. happy
5. disgust
6. surprised
7. calm
8. neutral

## Model Sources

You can use or fine-tune models from:

- [Hugging Face Speech Emotion Recognition](https://huggingface.co/models?pipeline_tag=audio-classification&sort=downloads)
- [wav2vec2-large-xlsr-53-english-speech-emotion-recognition](https://huggingface.co/ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition)

## Converting to ONNX

```python
from transformers import Wav2Vec2ForSequenceClassification
import torch

model = Wav2Vec2ForSequenceClassification.from_pretrained("your-model")
dummy_input = torch.randn(1, 32000)  # 2 seconds at 16kHz

torch.onnx.export(
    model,
    dummy_input,
    "emotion_model.onnx",
    input_names=["input_values"],
    output_names=["logits"],
    dynamic_axes={
        "input_values": {0: "batch", 1: "sequence"},
        "logits": {0: "batch"}
    },
    opset_version=14
)
```

## Quantization (Recommended)

For better web performance, quantize to INT8:

```python
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    "emotion_model.onnx",
    "emotion_model_quantized.onnx",
    weight_type=QuantType.QUInt8
)
```
