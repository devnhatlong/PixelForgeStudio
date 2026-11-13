// PixelForge Studio → Unity importer.
// Put this file in any "Editor" folder of your Unity project (e.g. Assets/Editor/PixelForgeImporter.cs).
// Then copy <name>.png + <name>.pfanim.json (from "Xuất file → Unity") into Assets/ — the importer runs
// automatically, or use the menu Tools ▸ PixelForge ▸ Import Selected .pfanim.json.
//
// What it does:
//  1. Texture import: Sprite (Multiple), Point filter, no compression, no mipmaps, PPU from the JSON.
//  2. Slices one sprite per frame with the custom pivot (feet anchor) from the JSON.
//  3. Creates one AnimationClip (.anim) per clip (SpriteRenderer.sprite curve, fps, loop, events).
//  4. Creates / updates an AnimatorController with one state per clip.
//
// Tested API surface: UnityEditor (TextureImporter, AnimationUtility, AnimatorController). Written for Unity 2021.3+.
// TextureImporter.spritesheet is marked obsolete in newer versions but still works; warnings are suppressed.

#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace PixelForge
{
    [Serializable] public class PfFrame { public string name; public int index; public int x; public int y; public int w; public int h; public float pivotX; public float pivotY; public int durationMs; }
    [Serializable] public class PfEvent { public int frame; public string functionName; public string stringParameter; }
    [Serializable] public class PfClip { public string name; public string state; public float fps; public bool loop; public string[] frames; public PfEvent[] events; }
    [Serializable] public class PfAnim { public string format; public int version; public string name; public string texture; public float pixelsPerUnit; public int atlasWidth; public int atlasHeight; public PfFrame[] frames; public PfClip[] clips; }

    public class PixelForgeImporter : AssetPostprocessor
    {
        const string Ext = ".pfanim.json";

        static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            foreach (var path in imported.Where(p => p.EndsWith(Ext, StringComparison.OrdinalIgnoreCase)))
            {
                // defer: the PNG may be imported in the same batch
                var p = path;
                EditorApplication.delayCall += () => Import(p);
            }
        }

        [MenuItem("Tools/PixelForge/Import Selected .pfanim.json")]
        static void ImportSelected()
        {
            foreach (var obj in Selection.objects)
            {
                var path = AssetDatabase.GetAssetPath(obj);
                if (path.EndsWith(Ext, StringComparison.OrdinalIgnoreCase)) Import(path);
            }
        }

        public static void Import(string jsonPath)
        {
            var json = File.ReadAllText(jsonPath);
            var data = JsonUtility.FromJson<PfAnim>(json);
            if (data == null || data.format != "pixelforge-unity") { Debug.LogWarning($"[PixelForge] Not a PixelForge file: {jsonPath}"); return; }

            var dir = Path.GetDirectoryName(jsonPath).Replace('\\', '/');
            var texPath = $"{dir}/{data.texture}";
            var importer = AssetImporter.GetAtPath(texPath) as TextureImporter;
            if (importer == null) { Debug.LogError($"[PixelForge] Texture not found next to the JSON: {texPath}"); return; }

            // 1. texture settings for crisp pixel art
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.filterMode = FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            importer.spritePixelsPerUnit = data.pixelsPerUnit > 0 ? data.pixelsPerUnit : 100;
            importer.maxTextureSize = Mathf.Max(importer.maxTextureSize, Mathf.NextPowerOfTwo(Mathf.Max(data.atlasWidth, data.atlasHeight)));

            // 2. one sprite per frame with the feet pivot
#pragma warning disable 0618
            importer.spritesheet = data.frames.Select(f => new SpriteMetaData
            {
                name = f.name,
                rect = new Rect(f.x, f.y, f.w, f.h),
                alignment = (int)SpriteAlignment.Custom,
                pivot = new Vector2(f.pivotX, f.pivotY),
            }).ToArray();
#pragma warning restore 0618
            importer.SaveAndReimport();

            var sprites = AssetDatabase.LoadAllAssetsAtPath(texPath).OfType<Sprite>().ToDictionary(s => s.name);

            // 3. clips
            var controllerPath = $"{dir}/{data.name}.controller";
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath) ?? AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            var sm = controller.layers[0].stateMachine;

            foreach (var c in data.clips ?? Array.Empty<PfClip>())
            {
                var fps = c.fps > 0 ? c.fps : 12f;
                var clip = new AnimationClip { frameRate = fps, name = c.name };
                var binding = EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite");
                var keys = new ObjectReferenceKeyframe[c.frames.Length + 1];
                for (var i = 0; i < c.frames.Length; i++)
                {
                    sprites.TryGetValue(c.frames[i], out var s);
                    if (s == null) Debug.LogWarning($"[PixelForge] Sprite '{c.frames[i]}' missing in {texPath}");
                    keys[i] = new ObjectReferenceKeyframe { time = i / fps, value = s };
                }
                // hold the last frame for its full duration
                keys[c.frames.Length] = new ObjectReferenceKeyframe { time = c.frames.Length / fps, value = keys[Math.Max(0, c.frames.Length - 1)].value };
                AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);

                var settings = AnimationUtility.GetAnimationClipSettings(clip);
                settings.loopTime = c.loop;
                AnimationUtility.SetAnimationClipSettings(clip, settings);

                if (c.events != null && c.events.Length > 0)
                    AnimationUtility.SetAnimationEvents(clip, c.events.Select(e => new AnimationEvent { time = e.frame / fps, functionName = e.functionName, stringParameter = e.stringParameter }).ToArray());

                var clipPath = $"{dir}/{data.name}_{Sanitize(c.name)}.anim";
                var existing = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
                if (existing != null) { EditorUtility.CopySerialized(clip, existing); clip = existing; }
                else AssetDatabase.CreateAsset(clip, clipPath);

                // 4. animator state per clip (first clip = default)
                var state = sm.states.Select(s => s.state).FirstOrDefault(s => s.name == c.name) ?? sm.AddState(c.name);
                state.motion = clip;
                if (sm.defaultState == null) sm.defaultState = state;
            }

            EditorUtility.SetDirty(controller);
            AssetDatabase.SaveAssets();
            Debug.Log($"[PixelForge] Imported {data.name}: {data.frames.Length} frames, {data.clips?.Length ?? 0} clips → {controllerPath}");
        }

        static string Sanitize(string s) => string.Concat(s.Select(ch => char.IsLetterOrDigit(ch) || ch == '_' || ch == '-' ? ch : '_'));
    }
}
#endif
