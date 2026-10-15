// Bakes projectile / hit-effect prefabs: simulates them frame by frame (particles with a fixed
// seed, animators, sprites, skinned meshes, trails emulated from transform history), writes every
// drawn primitive as triangles in projectile-local space, and renders ground-truth PNGs.
// Jobs (fx_jobs.txt): name|prefab|mode(proj/static)|T|dist|duration|curveKeys(t:v,...)
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

public static class RefFx
{
    const float FPS = 30f;
    const int SIZE = 384;
    static readonly CultureInfo ci = CultureInfo.InvariantCulture;

    class Item { public string tex; public string shader; public Color tint; public int layer, order, seq; public List<Vector2> v = new List<Vector2>(); public List<Vector2> uv = new List<Vector2>(); public List<Color> col = new List<Color>(); public List<int> tri = new List<int>(); }

    public static void Run()
    {
        Directory.CreateDirectory("fx");
        foreach (var line in File.ReadAllLines("fx_jobs.txt"))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try { Bake(line.Split('|')); }
            catch (System.Exception e) { Debug.LogError("FX FAIL " + line + " " + e); }
        }
        EditorApplication.Exit(0);
    }

    // the clip of the controller's default state (what the Animator plays on spawn)
    static AnimationClip DefaultClip(Animator an)
    {
        var ac = an.runtimeAnimatorController as UnityEditor.Animations.AnimatorController;
        if (ac && ac.layers.Length > 0)
        {
            var st = ac.layers[0].stateMachine.defaultState;
            if (st && st.motion is AnimationClip clip) return clip;
        }
        var ctrl = an.runtimeAnimatorController;
        return ctrl && ctrl.animationClips.Length > 0 ? ctrl.animationClips[0] : null;
    }

    static float EvalCurve(List<Vector2> keys, float x)
    {
        if (keys.Count == 0) return x;
        if (x <= keys[0].x) return keys[0].y;
        for (int i = 0; i < keys.Count - 1; i++)
            if (x <= keys[i + 1].x) { float f = (x - keys[i].x) / Mathf.Max(1e-5f, keys[i + 1].x - keys[i].x); return Mathf.Lerp(keys[i].y, keys[i + 1].y, f); }
        return keys[keys.Count - 1].y;
    }

    static int LayerOrder(string name)
    {
        string[] order = { "3D_BG", "FX_back", "Default", "BG_top", "FX_self", "bone_and_ik", "UI", "OverFX" };
        int i = System.Array.IndexOf(order, name); return i < 0 ? 2 : i;
    }

    static Color Prop(Material m, string n, Color d) { return m && m.HasProperty(n) ? m.GetColor(n) : d; }

    static void Bake(string[] p)
    {
        string name = p[0], prefabPath = p[1], mode = p[2];
        float T = float.Parse(p[3], ci), dist = float.Parse(p[4], ci), duration = float.Parse(p[5], ci);
        var curve = new List<Vector2>();
        if (p.Length > 6 && p[6].Length > 0)
            foreach (var kv in p[6].Split(',')) { var a = kv.Split(':'); curve.Add(new Vector2(float.Parse(a[0], ci), float.Parse(a[1], ci))); }
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        if (!prefab) { Debug.LogError("FX missing prefab " + prefabPath); return; }

        if (duration <= 0)
        {
            // static effects: as long as their particles / animations last
            float d = 0.3f;
            foreach (var ps in prefab.GetComponentsInChildren<ParticleSystem>(true)) d = Mathf.Max(d, ps.main.startDelay.constantMax + (ps.main.loop ? 1f : ps.main.duration) + ps.main.startLifetime.constantMax);
            foreach (var an in prefab.GetComponentsInChildren<Animator>(true)) if (an.runtimeAnimatorController) foreach (var c in an.runtimeAnimatorController.animationClips) d = Mathf.Max(d, c.length);
            duration = Mathf.Min(d, 3f);
        }
        int frames = Mathf.CeilToInt(duration * FPS) + 1;
        var allFrames = new List<List<Item>>();
        var origins = new List<float>();
        Bounds bounds = new Bounds(Vector3.zero, Vector3.one * 0.5f);
        for (int pass = 0; pass < 2; pass++)
        {
            var go = (GameObject)Object.Instantiate(prefab);
            go.transform.position = Vector3.zero;
            go.transform.rotation = Quaternion.identity;
            var systems = go.GetComponentsInChildren<ParticleSystem>(true);
            foreach (var ps in systems) { ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear); ps.useAutoRandomSeed = false; ps.randomSeed = 12345; }
            var anims = go.GetComponentsInChildren<Animator>(true);
            var trails = go.GetComponentsInChildren<TrailRenderer>(true);
            var history = trails.Select(t => new List<KeyValuePair<float, Vector3>>()).ToList();
            Camera cam = null; RenderTexture rt = null; Texture2D tex = null;
            if (pass == 1)
            {
                var cg = new GameObject("cam"); cam = cg.AddComponent<Camera>();
                cam.orthographic = true; cam.orthographicSize = Mathf.Max(bounds.extents.x, bounds.extents.y) * 1.1f;
                cam.transform.position = new Vector3(bounds.center.x, bounds.center.y, -50);
                cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0, 0, 0, 1);
                cam.nearClipPlane = 0.01f; cam.farClipPlane = 200;
                rt = new RenderTexture(SIZE, SIZE, 24, RenderTextureFormat.ARGB32); cam.targetTexture = rt;
                tex = new Texture2D(SIZE, SIZE, TextureFormat.RGBA32, false);
            }
            for (int f = 0; f < frames; f++)
            {
                float t = f / FPS;
                // projectile flight (Projectile.doMove: Lerp(start, goal, curve(t/T)))
                Vector3 pos = Vector3.zero;
                if (mode == "proj") pos = new Vector3(dist * EvalCurve(curve, Mathf.Clamp01(t / Mathf.Max(T, 1e-3f))), 0, 0);
                go.transform.position = pos;
                foreach (var an in anims)
                {
                    var c = DefaultClip(an);
                    if (c) c.SampleAnimation(an.gameObject, c.isLooping ? t % Mathf.Max(c.length, 1e-3f) : Mathf.Min(t, c.length));
                }
                foreach (var ps in systems)
                {
                    if (f == 0) ps.Simulate(0, false, true, true);
                    else ps.Simulate(1f / FPS, false, false, true);
                }
                for (int k = 0; k < trails.Length; k++) history[k].Add(new KeyValuePair<float, Vector3>(t, trails[k].transform.position));
                curCam = cam;
                var items = Collect(go, systems, trails, history, t, pos);
                if (pass == 0)
                {
                    // pass 0 only measures the framing
                    foreach (var it in items) foreach (var v in it.v) bounds.Encapsulate(new Vector3(v.x + pos.x, v.y + pos.y, 0));
                }
                else
                {
                    // data and ground-truth image come from the very same simulation step
                    allFrames.Add(items);
                    origins.Add(pos.x);
                }
                if (pass == 1 && f % 2 == 0)
                {
                    cam.Render(); RenderTexture.active = rt;
                    tex.ReadPixels(new Rect(0, 0, SIZE, SIZE), 0, 0); tex.Apply(); RenderTexture.active = null;
                    File.WriteAllBytes("fx/" + name + "_" + f + ".png", tex.EncodeToPNG());
                }
            }
            if (cam) Object.DestroyImmediate(cam.gameObject);
            Object.DestroyImmediate(go);
        }
        Write(name, mode, T, dist, duration, curve, bounds, allFrames, origins);
        Debug.Log("FXBAKED " + name + " frames=" + frames);
    }

    static void AddQuad(Item it, Vector2 c, Vector2 ax, Vector2 ay, Vector4 uvRect, Color col)
    {
        int b = it.v.Count;
        it.v.Add(c - ax - ay); it.v.Add(c + ax - ay); it.v.Add(c + ax + ay); it.v.Add(c - ax + ay);
        it.uv.Add(new Vector2(uvRect.x, uvRect.y)); it.uv.Add(new Vector2(uvRect.z, uvRect.y)); it.uv.Add(new Vector2(uvRect.z, uvRect.w)); it.uv.Add(new Vector2(uvRect.x, uvRect.w));
        for (int i = 0; i < 4; i++) it.col.Add(col);
        it.tri.Add(b); it.tri.Add(b + 1); it.tri.Add(b + 2); it.tri.Add(b); it.tri.Add(b + 2); it.tri.Add(b + 3);
    }

    static Item NewItem(Renderer r, Material m, int seq)
    {
        var it = new Item();
        // animated material values live in the renderer's property block
        var mpb = new MaterialPropertyBlock();
        r.GetPropertyBlock(mpb);
        System.Func<string, Color, Color> C = (n, d) => !mpb.isEmpty && mpb.HasColor(n) ? mpb.GetColor(n) : (m && m.HasProperty(n) ? m.GetColor(n) : d);
        System.Func<string, float, float> Fl = (n, d) => !mpb.isEmpty && mpb.HasFloat(n) ? mpb.GetFloat(n) : (m && m.HasProperty(n) ? m.GetFloat(n) : d);
        Texture mt = null;
        if (m)
        {
            if (!mpb.isEmpty && mpb.HasTexture("_MainTex") && mpb.GetTexture("_MainTex")) mt = mpb.GetTexture("_MainTex");
            else if (m.HasProperty("_MainTex") && m.mainTexture) mt = m.mainTexture;
            else if (m.HasProperty("_texture")) mt = m.GetTexture("_texture");
        }
        it.tex = mt ? AssetDatabase.GetAssetPath(mt) : "";
        it.shader = m && m.shader ? m.shader.name : "";
        bool particleShader = it.shader.Contains("Particles");
        it.tint = m && m.HasProperty("_TintColor") ? C("_TintColor", Color.white) * (particleShader ? 2f : 1f) : C("_Color", Color.white);
        if (m && m.HasProperty("_SecondColour")) { var s2 = C("_SecondColour", Color.white); it.tint = new Color(it.tint.r * s2.r, it.tint.g * s2.g, it.tint.b * s2.b, it.tint.a); }
        if (m && m.HasProperty("_AdditionalAlpha")) it.tint.a *= Fl("_AdditionalAlpha", 1);
        if (it.shader.Contains("bori_hide") && Fl("_change", 0) > 0.5f) it.tint.a = 0;
        it.layer = LayerOrder(r.sortingLayerName); it.order = r.sortingOrder; it.seq = seq;
        return it;
    }

    static Camera curCam;

    static void AddMesh(List<Item> items, Renderer r, Material m, Mesh mesh, int sub, int seq, Vector3 origin)
    {
        if (mesh.vertexCount == 0 || sub >= mesh.subMeshCount) return;
        var it = NewItem(r, m, seq);
        var v = mesh.vertices; var uv = mesh.uv; var c = mesh.colors32;
        for (int i = 0; i < v.Length; i++)
        {
            it.v.Add(new Vector2(v[i].x - origin.x, v[i].y - origin.y));
            it.uv.Add(i < uv.Length ? uv[i] : Vector2.zero);
            it.col.Add(c.Length == v.Length ? (Color)c[i] : Color.white);
        }
        it.tri.AddRange(mesh.GetTriangles(sub));
        items.Add(it);
    }

    static List<Item> Collect(GameObject go, ParticleSystem[] systems, TrailRenderer[] trails, List<List<KeyValuePair<float, Vector3>>> history, float t, Vector3 origin)
    {
        var items = new List<Item>();
        int seq = 0;
        foreach (var r in go.GetComponentsInChildren<Renderer>(false))
        {
            if (!r.enabled || !r.gameObject.activeInHierarchy) continue;
            seq++;
            if (r is SpriteRenderer sr)
            {
                if (!sr.sprite) continue;
                var it = NewItem(r, sr.sharedMaterial, seq);
                it.tex = AssetDatabase.GetAssetPath(sr.sprite.texture);
                var m = sr.transform.localToWorldMatrix;
                var sv = sr.sprite.vertices; var suv = sr.sprite.uv; var st = sr.sprite.triangles;
                float fx = sr.flipX ? -1 : 1, fy = sr.flipY ? -1 : 1;
                foreach (var v in sv) { var w = m.MultiplyPoint3x4(new Vector3(v.x * fx, v.y * fy, 0)); it.v.Add(new Vector2(w.x - origin.x, w.y - origin.y)); it.col.Add(sr.color); }
                it.uv.AddRange(suv);
                foreach (var i in st) it.tri.Add(i);
                items.Add(it);
            }
            else if (r is ParticleSystemRenderer pr)
            {
                // exactly what Unity draws: billboards / stretched / mesh particles, sheet uvs, colours, size caps
                if (!curCam) continue;
                var ps = pr.GetComponent<ParticleSystem>();
                if (!ps || ps.particleCount == 0) continue;
                var mesh = new Mesh();
                pr.BakeMesh(mesh, curCam, ParticleSystemBakeMeshOptions.BakeRotationAndScale | ParticleSystemBakeMeshOptions.BakePosition);
                AddMesh(items, r, pr.sharedMaterial, mesh, 0, seq, origin);
                if (mesh.subMeshCount > 1 && pr.trailMaterial) AddMesh(items, r, pr.trailMaterial, mesh, 1, seq, origin);
                Object.DestroyImmediate(mesh);
            }
            else if (r is SkinnedMeshRenderer smr || r is MeshRenderer)
            {
                Mesh mesh = null;
                if (r is SkinnedMeshRenderer s2) { if (!s2.sharedMesh) continue; mesh = new Mesh(); s2.BakeMesh(mesh, true); }
                else { var mf = r.GetComponent<MeshFilter>(); if (!mf || !mf.sharedMesh) continue; mesh = mf.sharedMesh; }
                var it = NewItem(r, r.sharedMaterial, seq);
                var tr = r.transform;
                bool skinned = r is SkinnedMeshRenderer;
                var cols = mesh.colors;
                var vv = mesh.vertices;
                for (int i = 0; i < vv.Length; i++)
                {
                    var w = skinned ? tr.position + tr.rotation * vv[i] : tr.localToWorldMatrix.MultiplyPoint3x4(vv[i]);
                    it.v.Add(new Vector2(w.x - origin.x, w.y - origin.y));
                    it.col.Add(cols.Length == vv.Length ? cols[i] : Color.white);
                }
                var muv = mesh.uv; for (int i = 0; i < vv.Length; i++) it.uv.Add(i < muv.Length ? muv[i] : Vector2.zero);
                it.tri.AddRange(mesh.triangles);
                items.Add(it);
            }
        }
        // trails: Unity's own trail mesh (world space)
        for (int k = 0; k < trails.Length; k++)
        {
            var tr = trails[k];
            if (!tr.enabled || !tr.gameObject.activeInHierarchy || !curCam) continue;
            var mesh = new Mesh();
            tr.BakeMesh(mesh, curCam, false);
            var before = items.Count;
            AddMesh(items, tr, tr.sharedMaterial, mesh, 0, 9999 + k, origin);
            Object.DestroyImmediate(mesh);
        }
        return items;
    }

    static void Write(string name, string mode, float T, float dist, float duration, List<Vector2> curve, Bounds b, List<List<Item>> frames, List<float> origins)
    {
        var texs = new List<string>(); var shaders = new List<string>();
        var sb = new StringBuilder();
        sb.Append("{\"name\":\"").Append(name).Append("\",\"mode\":\"").Append(mode).Append("\",\"T\":").Append(T.ToString(ci))
          .Append(",\"dist\":").Append(dist.ToString(ci)).Append(",\"fps\":").Append(FPS.ToString(ci))
          .Append(",\"cx\":").Append(b.center.x.ToString(ci)).Append(",\"cy\":").Append(b.center.y.ToString(ci))
          .Append(",\"half\":").Append((Mathf.Max(b.extents.x, b.extents.y) * 1.1f).ToString(ci))
          .Append(",\"org\":[").Append(string.Join(",", origins.Select(o => o.ToString("0.####", ci)))).Append("]")
          .Append(",\"frames\":[");
        for (int f = 0; f < frames.Count; f++)
        {
            if (f > 0) sb.Append(',');
            sb.Append('[');
            var items = frames[f].OrderBy(i => i.layer).ThenBy(i => i.order).ThenBy(i => i.seq).ToList();
            for (int k = 0; k < items.Count; k++)
            {
                var it = items[k];
                int ti = texs.IndexOf(it.tex); if (ti < 0) { texs.Add(it.tex); ti = texs.Count - 1; }
                int si = shaders.IndexOf(it.shader); if (si < 0) { shaders.Add(it.shader); si = shaders.Count - 1; }
                if (k > 0) sb.Append(',');
                sb.Append("{\"t\":").Append(ti).Append(",\"s\":").Append(si).Append(",\"tr\":").Append(it.seq >= 9999 ? 1 : 0)
                  .Append(",\"k\":[").Append(it.tint.r.ToString("0.###", ci)).Append(',').Append(it.tint.g.ToString("0.###", ci)).Append(',').Append(it.tint.b.ToString("0.###", ci)).Append(',').Append(it.tint.a.ToString("0.###", ci)).Append("]")
                  .Append(",\"v\":[").Append(string.Join(",", it.v.Select(v => v.x.ToString("0.####", ci) + "," + v.y.ToString("0.####", ci)))).Append(']')
                  .Append(",\"u\":[").Append(string.Join(",", it.uv.Select(v => v.x.ToString("0.####", ci) + "," + v.y.ToString("0.####", ci)))).Append(']')
                  .Append(",\"c\":[").Append(string.Join(",", it.col.Select(c => ((int)(c.r * 255)).ToString() + "," + ((int)(c.g * 255)) + "," + ((int)(c.b * 255)) + "," + ((int)(c.a * 255))))).Append(']')
                  .Append(",\"i\":[").Append(string.Join(",", it.tri)).Append("]}");
            }
            sb.Append(']');
        }
        sb.Append("],\"textures\":[").Append(string.Join(",", texs.Select(s => "\"" + s + "\""))).Append("],\"shaders\":[")
          .Append(string.Join(",", shaders.Select(s => "\"" + s + "\""))).Append("]}");
        File.WriteAllText("fx/" + name + ".json", sb.ToString());
    }
}
