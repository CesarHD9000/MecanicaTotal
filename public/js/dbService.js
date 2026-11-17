/* ==========================================================================
   dbService.js — Capa de servicios y consultas para Supabase
   --------------------------------------------------------------------------
   Transforma entre el modelo relacional normalizado y la estructura que
   consume la interfaz.

   REGLAS DE SEGURIDAD DE ESTE MÓDULO
   · No existe ningún acceso de respaldo con credenciales fijas.
   · La sesión se valida SIEMPRE contra Supabase Auth (nunca contra
     localStorage ni sessionStorage, que el visitante puede falsificar).
   · Toda operación de escritura exige sesión activa + rol `admin` en
     `public.profiles`. La autoridad final, de todos modos, son las políticas
     RLS: aunque alguien salte esta comprobación, la base de datos rechaza
     la escritura.
   · Los mensajes de error de autenticación nunca distinguen entre usuario
     inexistente, contraseña incorrecta o falta de permisos.
   ========================================================================== */

const DbService = (() => {

  const getClient = () => window.supabaseClient;

  // Bucket público de Supabase Storage donde se guardan imágenes y vídeos
  // (mitigación A-02). Crearlo en Supabase → Storage y marcarlo "público".
  const MEDIA_BUCKET = 'media';

  const ERR = {
    CONNECTION: 'CONNECTION',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    NOT_ADMIN: 'NOT_ADMIN',
    FORBIDDEN: 'FORBIDDEN'
  };

  /* Error de negocio con código estable para que la vista decida el mensaje. */
  function fail(code, message) {
    const err = new Error(message || code);
    err.code = code;
    return err;
  }

  // --------------------------------------------------------------------------
  // MAPPERS: Relacional (BD) <-> Estructura UI
  // --------------------------------------------------------------------------
  function mapQuestion(q) {
    const sortedOptions = (q.question_options || []).slice().sort((a, b) => a.order_index - b.order_index);
    const correctIdx = sortedOptions.findIndex(o => o.is_correct === true);
    return {
      id: q.id,
      q: q.question_text,
      options: sortedOptions.map(o => o.option_text),
      optionIds: sortedOptions.map(o => o.id),
      correct: correctIdx >= 0 ? correctIdx : null   // null = no disponible (público)
    };
  }

  function mapQuestions(questions) {
    return (questions || []).slice().sort((a, b) => a.order_index - b.order_index).map(mapQuestion);
  }

  function mapLessonFromDb(lesson) {
    // Supabase devuelve un objeto directo {} en relaciones 1:1 con UNIQUE
    let dailyQuiz = null;
    if (lesson.quizzes) {
      dailyQuiz = Array.isArray(lesson.quizzes) ? (lesson.quizzes[0] || null) : lesson.quizzes;
    }

    const theorySubsections = (lesson.lesson_subsections || [])
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map(s => ({ subtitle: s.subtitle, content: s.content }));

    const galleryItems = (lesson.lesson_gallery || [])
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map(g => ({ image: g.image_url, caption: g.caption }));

    let videoData = null;
    if (lesson.lesson_videos) {
      videoData = Array.isArray(lesson.lesson_videos) ? (lesson.lesson_videos[0] || null) : lesson.lesson_videos;
    }

    return {
      dbId: lesson.id,
      id: `day-${lesson.day_number}`,
      dayNumber: lesson.day_number,
      title: lesson.title,
      icon: lesson.icon_key || 'tools',
      coverImage: lesson.cover_image_url || '',
      shortDesc: lesson.short_description || '',
      objective: lesson.objective || '',
      introContent: lesson.intro_content || '',
      quizId: dailyQuiz ? dailyQuiz.id : null,
      sections: {
        theory: {
          mainTitle: lesson.title,
          subsections: theorySubsections
        },
        gallery: galleryItems,
        video: videoData ? {
          type: videoData.source_type || 'url',
          src: videoData.video_url || '',
          title: videoData.title || ''
        } : { type: 'url', src: '', title: '' },
        quiz: dailyQuiz ? mapQuestions(dailyQuiz.questions) : []
      }
    };
  }

  function mapFinalQuizFromDb(quiz) {
    if (!quiz || !Array.isArray(quiz.questions)) return [];
    return mapQuestions(quiz.questions);
  }

  // --------------------------------------------------------------------------
  // SESIÓN Y ROL
  // --------------------------------------------------------------------------

  /* Devuelve { user, isAdmin } si hay sesión válida, o null.
     Nunca consulta almacenamiento manipulable por el visitante. */
  async function getSession() {
    const client = getClient();
    if (!client) return null;

    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data || !data.session || !data.session.user) return null;

      const user = data.session.user;
      return { user, isAdmin: await isAdminUser(user.id) };
    } catch (err) {
      return null;
    }
  }

  /* Comprueba el rol contra la RPC `is_admin()` (SECURITY DEFINER).
     Verificado contra la BD: la función existe y es SECURITY DEFINER, así que
     no hace falta el fallback directo a `public.profiles` (superficie redundante). */
  async function isAdminUser(userId) {
    const client = getClient();
    if (!client || !userId) return false;

    try {
      const { data, error } = await client.rpc('is_admin');
      if (!error && typeof data === 'boolean') return data;
    } catch (err) {
      // La RPC no está disponible o falló: no se concede acceso.
    }
    return false;
  }

  /* Guardia de escritura: exige sesión + rol admin antes de tocar la BD.
     Es una ayuda de UX y defensa en profundidad; la RLS sigue mandando. */
  async function requireAdmin() {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');

    const session = await getSession();
    if (!session) throw fail(ERR.CONNECTION, 'La sesión expiró. Vuelve a iniciar sesión.');
    if (!session.isAdmin) throw fail(ERR.FORBIDDEN, 'Tu cuenta no tiene permisos de administrador.');
    return session.user;
  }

  // --------------------------------------------------------------------------
  // CONSULTAS PÚBLICAS (Lecciones y Cursos)
  // --------------------------------------------------------------------------
  /* ¿Hay sesión autenticada? Se usa para decidir si incluir `is_correct`:
     solo el panel (autenticado) necesita las respuestas para editar. El resto
     del tiempo las respuestas NO viajan al navegador (mitigación M-01). */
  async function hasAuthSession() {
    const client = getClient();
    if (!client) return false;
    try {
      const { data } = await client.auth.getSession();
      return Boolean(data && data.session && data.session.user);
    } catch (err) {
      return false;
    }
  }

  async function getAllDays() {
    const client = getClient();
    if (!client) return [];

    const includeAnswers = await hasAuthSession();
    const optsSel = includeAnswers
      ? 'question_options(id, order_index, option_text, is_correct)'
      : 'question_options(id, order_index, option_text)';

    try {
      const { data, error } = await client
        .from('lessons')
        .select(`
          id,
          day_number,
          title,
          icon_key,
          cover_image_url,
          short_description,
          objective,
          intro_content,
          lesson_subsections(id, order_index, subtitle, content),
          lesson_gallery(id, order_index, image_url, caption),
          lesson_videos(id, title, source_type, video_url),
          quizzes(
            id,
            quiz_type,
            title,
            questions(
              id,
              order_index,
              question_text,
              ${optsSel}
            )
          )
        `)
        .order('day_number', { ascending: true });

      if (error) {
        console.error('[DbService] Error al consultar lecciones:', error.message);
        // Se propaga en vez de devolver []: un fallo de red y una base de datos
        // sin lecciones no son lo mismo, y la interfaz debe poder distinguirlos.
        throw fail('DB_ERROR', 'No se pudo cargar el temario.');
      }

      return (data || []).map(mapLessonFromDb);
    } catch (err) {
      if (err && err.code) throw err;           // error ya normalizado
      console.error('[DbService] Error inesperado en getAllDays.');
      throw fail('CONNECTION', 'No se pudo conectar con la base de datos.');
    }
  }

  async function getFinalQuiz() {
    const client = getClient();
    if (!client) return null;

    const includeAnswers = await hasAuthSession();
    const optsSel = includeAnswers
      ? 'question_options(id, order_index, option_text, is_correct)'
      : 'question_options(id, order_index, option_text)';

    try {
      const { data, error } = await client
        .from('quizzes')
        .select(`
          id,
          quiz_type,
          title,
          questions(
            id,
            order_index,
            question_text,
            ${optsSel}
          )
        `)
        .eq('quiz_type', 'final')
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return { id: data.id, questions: mapFinalQuizFromDb(data) };
    } catch (err) {
      console.error('[DbService] Error inesperado en getFinalQuiz.');
      return null;
    }
  }

  /* Corrige un cuestionario en el servidor (RPC grade_quiz, SECURITY DEFINER)
     y devuelve { correct, total } sin exponer la opción correcta por pregunta. */
  async function gradeQuiz(quizId, answers) {
    const client = getClient();
    if (!client || !quizId) return null;
    try {
      const { data, error } = await client.rpc('grade_quiz', {
        p_quiz_id: quizId,
        p_answers: answers || []
      });
      if (error) {
        console.warn('[DbService] grade_quiz:', error.message);
        return null;
      }
      return data || null;
    } catch (err) {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // GESTIÓN ADMIN
  // --------------------------------------------------------------------------

  /* Identificador del curso activo. Se resuelve una vez y se reutiliza. */
  let cachedCourseId = null;
  async function resolveCourseId(client) {
    if (cachedCourseId) return cachedCourseId;
    const { data } = await client.from('courses').select('id').order('id').limit(1).maybeSingle();
    cachedCourseId = data ? data.id : null;
    return cachedCourseId;
  }

  async function saveDay(dayObj) {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');
    await requireAdmin();

    const dayNumber = parseInt(dayObj.dayNumber, 10);
    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      throw fail('VALIDATION', 'El número de día no es válido.');
    }

    const courseId = await resolveCourseId(client);
    if (!courseId) throw fail('VALIDATION', 'No hay ningún curso creado en la base de datos.');

    const lessonPayload = {
      course_id: courseId,
      day_number: dayNumber,
      title: String(dayObj.title || '').trim(),
      icon_key: dayObj.icon || 'tools',
      cover_image_url: dayObj.coverImage || '',
      short_description: dayObj.shortDesc || '',
      objective: dayObj.objective || '',
      intro_content: dayObj.introContent || ''
    };

    let lessonId;

    if (dayObj.dbId) {
      /* Edición. Si cambió el número, se mueve el registro existente: un upsert
         por (curso, día) crearía un día nuevo y dejaría huérfano el anterior. */
      const { data: actual, error: readErr } = await client
        .from('lessons')
        .select('id, day_number')
        .eq('id', dayObj.dbId)
        .maybeSingle();

      if (readErr) throw fail('DB_ERROR', 'No se pudo leer la lección.');
      if (!actual) throw fail('VALIDATION', 'La lección ya no existe. Recarga el panel.');

      if (actual.day_number !== dayNumber) {
        const { data: ocupado } = await client
          .from('lessons')
          .select('id')
          .eq('course_id', courseId)
          .eq('day_number', dayNumber)
          .maybeSingle();

        if (ocupado) throw fail('DUPLICATE_DAY', `Ya existe una lección con el día ${dayNumber}.`);

        const { error: moveErr } = await client
          .from('lessons')
          .update({ day_number: dayNumber })
          .eq('id', dayObj.dbId);

        if (moveErr) throw fail('DB_ERROR', 'No se pudo cambiar el número del día.');
      }

      const { error: updateErr } = await client
        .from('lessons')
        .update(lessonPayload)
        .eq('id', dayObj.dbId);

      if (updateErr) {
        console.error('[DbService] Error al actualizar la lección:', updateErr.message);
        throw fail('DB_ERROR', 'No se pudo guardar la lección.');
      }

      lessonId = dayObj.dbId;
    } else {
      /* Alta. Se comprueba el número antes de insertar: el upsert anterior
         sobrescribía en silencio la lección de otro día. */
      const { data: ocupado } = await client
        .from('lessons')
        .select('id')
        .eq('course_id', courseId)
        .eq('day_number', dayNumber)
        .maybeSingle();

      if (ocupado) {
        throw fail('DUPLICATE_DAY', `El día ${dayNumber} ya existe. Edítalo en lugar de crearlo.`);
      }

      const { data: created, error: insertErr } = await client
        .from('lessons')
        .insert(lessonPayload)
        .select('id')
        .single();

      if (insertErr || !created) {
        console.error('[DbService] Error al crear la lección:', insertErr && insertErr.message);
        throw fail('DB_ERROR', 'No se pudo guardar la lección.');
      }

      lessonId = created.id;
    }
    const sections = dayObj.sections || {};

    // --- Subsecciones: se reemplazan en bloque ---
    if (sections.theory && Array.isArray(sections.theory.subsections)) {
      const rows = sections.theory.subsections
        .filter(s => (s.subtitle || '').trim() || (s.content || '').trim())
        .map((s, idx) => ({
          lesson_id: lessonId,
          order_index: idx + 1,
          subtitle: (s.subtitle || '').trim() || `Subsección ${idx + 1}`,
          content: s.content || ''
        }));

      await client.from('lesson_subsections').delete().eq('lesson_id', lessonId);
      if (rows.length) {
        const { error } = await client.from('lesson_subsections').insert(rows);
        if (error) {
          console.error('[DbService] Error al guardar subsecciones:', error.message);
          throw fail('DB_ERROR', 'No se pudieron guardar las subsecciones.');
        }
      }
    }

    // --- Galería: se reemplaza en bloque ---
    if (Array.isArray(sections.gallery)) {
      const rows = sections.gallery
        .filter(g => (g.image || '').trim())
        .map((g, idx) => ({
          lesson_id: lessonId,
          order_index: idx + 1,
          image_url: g.image.trim(),
          caption: (g.caption || '').trim() || `Muestra ${idx + 1}`
        }));

      await client.from('lesson_gallery').delete().eq('lesson_id', lessonId);
      if (rows.length) {
        const { error } = await client.from('lesson_gallery').insert(rows);
        if (error) {
          console.error('[DbService] Error al guardar galería:', error.message);
          throw fail('DB_ERROR', 'No se pudo guardar la galería.');
        }
      }
    }

    // --- Video (1:1 por lección) ---
    if (sections.video) {
      const v = sections.video;
      const vType = v.type === 'upload' ? 'upload' : 'url';
      const rawSrc = (v.src || '').trim();
      const vSrc = vType === 'url' ? Utils.formatVideoUrl(rawSrc) : Utils.safeMediaUrl(rawSrc);

      if (vSrc) {
        const { error } = await client.from('lesson_videos').upsert({
          lesson_id: lessonId,
          title: (v.title || '').trim() || 'Video Demostrativo',
          source_type: vType,
          video_url: vSrc
        }, { onConflict: 'lesson_id' });

        if (error) {
          console.error('[DbService] Error al guardar el video:', error.message);
          throw fail('DB_ERROR', 'No se pudo guardar el video.');
        }
      } else {
        await client.from('lesson_videos').delete().eq('lesson_id', lessonId);
      }
    }

    return await getAllDays();
  }

  async function deleteDay(dayNumber) {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');
    await requireAdmin();

    const courseId = await resolveCourseId(client);
    const day = parseInt(dayNumber, 10);
    if (!Number.isInteger(day)) throw fail('VALIDATION', 'Número de día inválido.');

    // Se filtra también por curso: evita borrar el día de otro curso.
    const { error } = await client
      .from('lessons')
      .delete()
      .eq('course_id', courseId)
      .eq('day_number', day);

    if (error) {
      console.error('[DbService] Error al eliminar la lección:', error.message);
      throw fail('DB_ERROR', 'No se pudo eliminar la lección.');
    }
    return await getAllDays();
  }

  /* Reemplaza por completo las preguntas de un cuestionario.
     Inserta preguntas en un solo lote y opciones en otro: dos viajes a la red
     en lugar de dos por pregunta. */
  async function replaceQuestions(client, quizId, questions) {
    const { error: delErr } = await client.from('questions').delete().eq('quiz_id', quizId);
    if (delErr) throw fail('DB_ERROR', 'No se pudieron reemplazar las preguntas.');

    const clean = (questions || []).filter(q => (q.q || '').trim());
    if (!clean.length) return;

    const questionRows = clean.map((q, idx) => ({
      quiz_id: quizId,
      order_index: idx + 1,
      question_text: q.q.trim()
    }));

    const { data: created, error: qErr } = await client
      .from('questions')
      .insert(questionRows)
      .select('id, order_index');

    if (qErr || !created) {
      console.error('[DbService] Error al insertar preguntas:', qErr && qErr.message);
      throw fail('DB_ERROR', 'No se pudieron guardar las preguntas.');
    }

    const idByOrder = new Map(created.map(row => [row.order_index, row.id]));
    const optionRows = [];

    clean.forEach((q, idx) => {
      const questionId = idByOrder.get(idx + 1);
      if (!questionId) return;
      (q.options || []).forEach((optText, optIdx) => {
        const text = String(optText || '').trim();
        if (!text) return;
        optionRows.push({
          question_id: questionId,
          order_index: optIdx + 1,
          option_text: text,
          is_correct: optIdx === q.correct
        });
      });
    });

    if (optionRows.length) {
      const { error: optErr } = await client.from('question_options').insert(optionRows);
      if (optErr) {
        console.error('[DbService] Error al insertar opciones:', optErr.message);
        throw fail('DB_ERROR', 'No se pudieron guardar las opciones.');
      }
    }
  }

  async function saveQuiz(dayNumber, quizQuestions) {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');
    await requireAdmin();

    const day = parseInt(dayNumber, 10);
    if (!Number.isInteger(day)) throw fail('VALIDATION', 'Número de día inválido.');

    const courseId = await resolveCourseId(client);

    /* Filtrado por curso: sin él, dos cursos con el mismo número de día
       compartirían cuestionario y se guardaría en el equivocado. */
    const { data: lesson } = await client
      .from('lessons')
      .select('id')
      .eq('course_id', courseId)
      .eq('day_number', day)
      .maybeSingle();

    if (!lesson) throw fail('VALIDATION', 'La lección no existe.');

    let quizId;
    const { data: existingQuiz } = await client
      .from('quizzes')
      .select('id')
      .eq('lesson_id', lesson.id)
      .eq('quiz_type', 'daily')
      .maybeSingle();

    if (existingQuiz) {
      quizId = existingQuiz.id;
    } else {
      const { data: newQuiz, error } = await client
        .from('quizzes')
        .insert({ lesson_id: lesson.id, quiz_type: 'daily', title: `Quiz Día ${day}` })
        .select('id')
        .single();
      if (error || !newQuiz) throw fail('DB_ERROR', 'No se pudo crear el cuestionario.');
      quizId = newQuiz.id;
    }

    await replaceQuestions(client, quizId, quizQuestions);
    return true;
  }

  async function saveFinalQuiz(questions) {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');
    await requireAdmin();

    const courseId = await resolveCourseId(client);
    if (!courseId) throw fail('VALIDATION', 'No hay ningún curso creado en la base de datos.');

    let quizId;
    const { data: existingQuiz } = await client
      .from('quizzes')
      .select('id')
      .eq('course_id', courseId)
      .eq('quiz_type', 'final')
      .maybeSingle();

    if (existingQuiz) {
      quizId = existingQuiz.id;
    } else {
      const { data: newQuiz, error } = await client
        .from('quizzes')
        .insert({
          course_id: courseId,
          quiz_type: 'final',
          title: 'Evaluación Diagnóstica Final de Nivel Global'
        })
        .select('id')
        .single();
      if (error || !newQuiz) throw fail('DB_ERROR', 'No se pudo crear el examen final.');
      quizId = newQuiz.id;
    }

    await replaceQuestions(client, quizId, questions);
    return true;
  }

  // --------------------------------------------------------------------------
  // CONTACTO
  // --------------------------------------------------------------------------
  /* Inserta el mensaje en `public.contact_messages` (RLS: solo INSERT público).
     Los límites de longitud replican los CHECK de la tabla para fallar antes. */
  async function sendContactMessage({ name, email, message }) {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');

    const payload = {
      name: String(name || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      message: String(message || '').trim()
    };

    if (payload.name.length < 2 || payload.name.length > 150) {
      throw fail('VALIDATION', 'El nombre debe tener entre 2 y 150 caracteres.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(payload.email) || payload.email.length > 255) {
      throw fail('VALIDATION', 'El correo electrónico no es válido.');
    }
    if (payload.message.length < 10 || payload.message.length > 5000) {
      throw fail('VALIDATION', 'El mensaje debe tener entre 10 y 5000 caracteres.');
    }

    const { error } = await client.from('contact_messages').insert(payload);
    if (error) {
      console.error('[DbService] Error al enviar el mensaje:', error.message);
      throw fail('DB_ERROR', 'No se pudo enviar el mensaje.');
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // BANDEJA DE CONTACTO (solo admin)
  // --------------------------------------------------------------------------
  /* Lista los mensajes recibidos. Se pide `*` a propósito: si la migración que
     añade `status`/`replied_at` todavía no se ejecutó, la consulta sigue
     funcionando y la vista trata el estado ausente como "nuevo". */
  async function listContactMessages() {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');
    await requireAdmin();

    const { data, error } = await client
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DbService] Error al leer los mensajes:', error.message);
      throw fail('DB_ERROR', 'No se pudieron cargar los mensajes.');
    }
    return data || [];
  }

  /* Cambia el estado de un mensaje: 'nuevo' | 'respondido'. */
  async function setContactMessageStatus(id, status) {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');
    await requireAdmin();

    const patch = { status: status === 'respondido' ? 'respondido' : 'nuevo' };
    if (patch.status === 'respondido') patch.replied_at = new Date().toISOString();
    else patch.replied_at = null;

    const { error } = await client.from('contact_messages').update(patch).eq('id', id);
    if (error) {
      console.error('[DbService] Error al actualizar el mensaje:', error.message);
      // El caso más probable: falta ejecutar la migración de la columna status.
      throw fail('DB_ERROR', 'No se pudo actualizar el mensaje. ¿Ejecutaste la migración de la bandeja?');
    }
    return true;
  }

  async function deleteContactMessage(id) {
    const client = getClient();
    if (!client) throw fail(ERR.CONNECTION, 'Sin conexión con la base de datos.');
    await requireAdmin();

    const { error } = await client.from('contact_messages').delete().eq('id', id);
    if (error) {
      console.error('[DbService] Error al eliminar el mensaje:', error.message);
      throw fail('DB_ERROR', 'No se pudo eliminar el mensaje.');
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // AUTENTICACIÓN ADMIN
  // --------------------------------------------------------------------------
  /* Devuelve SIEMPRE un código, nunca un texto distinto según el caso: la vista
     decide el mensaje. Así no se revela si falló el usuario, la contraseña, la
     configuración del servidor ni la existencia de la cuenta. */
  async function login(email, password) {
    const client = getClient();
    const cleanEmail = String(email || '').trim();

    if (!client) {
      console.warn('[Auth] Cliente de base de datos no disponible.');
      return { user: null, error: { code: ERR.CONNECTION } };
    }
    if (!cleanEmail || !password) {
      return { user: null, error: { code: ERR.INVALID_CREDENTIALS } };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (error || !data || !data.user) {
        console.warn('[Auth] Intento de acceso rechazado.');
        return { user: null, error: { code: ERR.INVALID_CREDENTIALS } };
      }

      // Se cierra la sesión de inmediato si la cuenta no es administradora:
      // un alumno autenticado no debe quedarse con una sesión abierta en el panel.
      const admin = await isAdminUser(data.user.id);
      if (!admin) {
        // Pista solo para el desarrollador: lo habitual es que falte la fila en
        // public.profiles o que su role no sea 'admin'.
        console.warn('[Auth] La cuenta no tiene role = "admin" en public.profiles. Revisa docs/sql/rls_seguro_admin.sql.');
        await client.auth.signOut();
        return { user: null, error: { code: ERR.INVALID_CREDENTIALS } };
      }

      return { user: data.user, error: null };
    } catch (err) {
      console.warn('[Auth] Error de conexión durante el inicio de sesión.');
      return { user: null, error: { code: ERR.CONNECTION } };
    }
  }

  async function logout() {
    const client = getClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        // Si el token ya expiró, no hay nada que cerrar.
      }
    }
  }

  /* Sube un archivo a Supabase Storage y devuelve su URL pública.
     Sustituye a guardar archivos en base64 dentro de la BD (mitigación A-02). */
  async function uploadMedia(file, folder = 'media') {
    const client = getClient();
    if (!client || !file) throw fail(ERR.CONNECTION, 'No se pudo subir el archivo.');

    const safeName = String(file.name || 'archivo')
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const ext = (safeName.split('.').pop() || 'bin').toLowerCase().slice(0, 10);
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await client.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, { cacheControl: '31536000', upsert: false });

    if (error) {
      console.error('[DbService] Error al subir a Storage:', error.message);
      throw fail('DB_ERROR', 'No se pudo subir el archivo.');
    }

    const { data: pub } = client.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return pub && pub.publicUrl ? pub.publicUrl : '';
  }

  return {
    ERR,
    getAllDays,
    getFinalQuiz,
    gradeQuiz,
    uploadMedia,
    saveDay,
    deleteDay,
    saveQuiz,
    saveFinalQuiz,
    sendContactMessage,
    listContactMessages,
    setContactMessageStatus,
    deleteContactMessage,
    formatVideoUrl: (url) => Utils.formatVideoUrl(url),
    login,
    logout,
    getSession,
    isAdminUser
  };
})();

window.DbService = DbService;
