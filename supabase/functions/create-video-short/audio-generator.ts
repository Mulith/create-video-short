export async function generateVoiceNarration(text, voiceId) {
  console.log('🎙️ Generating voice narration with ElevenLabs...');
  console.log('🎙️ Voice ID:', voiceId);
  console.log('🎙️ Text length:', text.length);
  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('ElevenLabs API key not found');
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Invalid text input for voice generation');
    }
    if (!voiceId || typeof voiceId !== 'string') {
      throw new Error('Invalid voice ID');
    }
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text.trim(),
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
      const errorText = await response.text();
      console.error('❌ ElevenLabs API error:', response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }
    const audioBuffer = await response.arrayBuffer();
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error('ElevenLabs API returned empty audio data');
    }
    console.log('✅ Voice narration generated successfully, size:', audioBuffer.byteLength, 'bytes');
    return new Uint8Array(audioBuffer);
  } catch (error) {
    console.error('❌ Error generating voice narration:', error);
    throw new Error(`Voice generation failed: ${error.message}`);
  }
}
