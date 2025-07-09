export async function generateVoiceNarration(text: string, voiceId: string): Promise<Uint8Array> {
  console.log('🎙️ Generating voice narration with ElevenLabs...');
  console.log('🎙️ Voice ID:', voiceId);
  console.log('🎙️ Text length:', text.length);
  
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    throw new Error('ElevenLabs API key not found');
  }
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
        style: 0.5,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`✅ Voice narration generated successfully, size: ${audioBuffer.byteLength} bytes`);
  return new Uint8Array(audioBuffer);
}
