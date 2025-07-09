import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { processVideoCreation } from './video-processor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Scene {
  scene_number: number;
  start_time_seconds: number;
  end_time_seconds: number;
  narration_text: string;
  visual_description: string;
  content_scene_videos?: {
    video_url: string;
    video_status: string;
  }[];
}

interface ContentItem {
  id: string;
  title: string;
  script: string;
  content_scenes: Scene[];
}

serve(async (req) => {
  console.log('🎬 Video creation function called');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Parsing request body...');
    const requestBody = await req.json();
    console.log('📥 Request body:', requestBody);
    
    const { contentItemId, voiceId = 'Aria' } = requestBody;

    if (!contentItemId) {
      throw new Error('Content item ID is required');
    }

    console.log('🎥 Starting video creation for content item:', contentItemId);

    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const elevenlabsKey = Deno.env.get('ELEVENLABS_API_KEY');
    const ffmpegServiceUrl = Deno.env.get('FFMPEG_SERVICE_URL');
    
    console.log('🔑 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasElevenlabsKey: !!elevenlabsKey,
      hasFFmpegServiceUrl: !!ffmpegServiceUrl,
      ffmpegServiceUrl: ffmpegServiceUrl // Log the actual URL for debugging
    });

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    if (!elevenlabsKey) {
      throw new Error('Missing ElevenLabs API key');
    }

    if (!ffmpegServiceUrl) {
      throw new Error('Missing FFmpeg service URL');
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch content item with scenes and generated images
    console.log('🔍 Fetching content item from database...');
    const { data: contentItem, error } = await supabase
      .from('content_items')
      .select(`
        *,
        content_scenes!inner(
          *,
          content_scene_videos(*)
        )
      `)
      .eq('id', contentItemId)
      .order('scene_number', { foreignTable: 'content_scenes', ascending: true })
      .single() as { data: ContentItem | null, error: any };

    console.log('📊 Database query result:', {
      hasData: !!contentItem,
      error: error?.message,
      contentItemTitle: contentItem?.title,
      scenesCount: contentItem?.content_scenes?.length || 0
    });

    if (error || !contentItem) {
      throw new Error(`Failed to fetch content item: ${error?.message || 'Not found'}`);
    }

    console.log('📄 Retrieved content item:', {
      title: contentItem.title,
      scenesCount: contentItem.content_scenes?.length || 0
    });

    // Process video creation using the refactored video processor
    const result = await processVideoCreation(supabase, contentItem, voiceId);

    // Update content item with video file path
    await supabase
      .from('content_items')
      .update({
        video_status: 'completed',
        video_file_path: result.storagePath,
        updated_at: new Date().toISOString()
      })
      .eq('id', contentItemId);

    console.log('🎉 Video creation completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        videoPath: result.storagePath,
        contentItemId: contentItemId,
        scenesProcessed: result.scenesProcessed,
        title: contentItem.title,
        totalDuration: result.totalDuration
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('💥 Video creation error:', error);
    console.error('💥 Error stack:', error.stack);
    console.error('💥 Error name:', error.name);
    console.error('💥 Error message:', error.message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        details: error.stack || 'No stack trace available'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
