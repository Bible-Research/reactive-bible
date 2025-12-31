# CURRENT BRANCH STATUS

When requesting HLS format audio (fileset_id "ENGESHN1SA" for example) the API returns this:
{
    "book": "LUK",
    "book_name": "Luke",
    "chapter": 18,
    "audio_url": "https://b4.dbt.io/api/bible/filesets/ENGESHN1SA/LUK-18-1-/playlist.m3u8",
    "duration_seconds": 318,
    "file_size_bytes": 2554242,
    "format": "audio"
}

When requesting that audio_url by adding required headers the API returns this:
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=64312,CODECS="mp4a.40.2"
B03___18_Luke________ENGESHN1SA-64kbs.m3u8?verse_start=1

When trying to play it using HLS no audio is played.

