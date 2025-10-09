CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE FUNCTION b64url(b64 TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN replace(replace(trim(trailing '=' FROM b64), '+', '-'), '/', '_');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.users (
    id TEXT DEFAULT b64url(encode(public.gen_random_bytes(8), 'base64')) NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    bio TEXT,
    avatar TEXT,
    pass TEXT,
    salt TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT users_avatar_fkey FOREIGN KEY (image) REFERENCES public.images(id) ON DELETE SET NULL
);

CREATE INDEX users_id_idx ON public.users(id);

CREATE TABLE public.connections (
    user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (user_id, provider, external_id),
    CONSTRAINT connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX connections_user_id_idx ON public.connections(user_id);
CREATE INDEX connections_name_idx ON public.connections(name);

CREATE TABLE public.items (
    id TEXT DEFAULT b64url(encode(public.gen_random_bytes(8), 'base64')) NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    image TEXT,  
    updated_by TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT items_image_fkey FOREIGN KEY (image) REFERENCES public.images(id) ON DELETE SET NULL
);

CREATE INDEX items_id_idx ON public.items(id);

CREATE TABLE public.tags (
    id TEXT DEFAULT b64url(encode(public.gen_random_bytes(8), 'base64')) NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    info TEXT,
    PRIMARY KEY (id)
);

CREATE INDEX tags_id_idx ON public.tags(id);

CREATE TABLE public.comments (
    id TEXT DEFAULT b64url(encode(public.gen_random_bytes(8), 'base64')) NOT NULL UNIQUE,
    item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT comments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE,
    CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX comments_id_idx ON public.comments(id);
CREATE INDEX comments_item_id_idx ON public.comments(item_id);
CREATE INDEX comments_user_id_idx ON public.comments(user_id);
CREATE INDEX comments_item_user_id_idx ON public.comments(item_id, user_id);

CREATE TABLE public.item_tags (
    item_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    active BOOL DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id, tag_id),
    CONSTRAINT item_tags_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE,
    CONSTRAINT item_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE
);

CREATE INDEX item_tags_item_id_idx ON public.item_tags(item_id);
CREATE INDEX item_tags_tag_id_idx ON public.item_tags(tag_id);
CREATE INDEX item_tags_item_tag_idx ON public.item_tags(item_id, tag_id);

CREATE TABLE public.item_votes (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    rating BOOL NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT item_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT item_votes_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE
);

CREATE INDEX item_votes_user_id_idx ON public.item_votes(user_id);
CREATE INDEX item_votes_item_id_idx ON public.item_votes(item_id);

CREATE TABLE public.tag_votes (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    rating BOOL NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item_id, tag_id),
  CONSTRAINT tag_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT tag_votes_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE,
  CONSTRAINT tag_votes_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE
);

CREATE INDEX tag_votes_user_id_idx ON public.tag_votes(user_id);
CREATE INDEX tag_votes_item_tag_idx ON public.tag_votes(item_id, tag_id);

CREATE TABLE public.comment_votes (
    user_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    rating BOOL NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, comment_id),
  CONSTRAINT comment_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT comment_votes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE
);

CREATE INDEX comment_votes_user_id_idx ON public.comment_votes(user_id);
CREATE INDEX comment_votes_comment_id_idx ON public.comment_votes(comment_id);

CREATE TABLE public.profile_votes (
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    rating BOOL NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, profile_id),
  CONSTRAINT profile_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT profile_votes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX profile_votes_user_id_idx ON public.profile_votes(user_id);
CREATE INDEX profile_votes_profile_id_idx ON public.profile_votes(profile_id);

CREATE TABLE public.redirects (
    from_name TEXT NOT NULL,
    to_name TEXT NOT NULL,
    redirect_type CHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (from_name, redirect_type)
);

CREATE INDEX redirects_from_name_idx ON public.redirects(from_name);
CREATE INDEX redirects_to_name_idx ON public.redirects(to_name);
CREATE INDEX redirects_redirect_type_idx ON public.redirects(redirect_type);

CREATE TABLE public.images (
    id TEXT NOT NULL UNIQUE,
    PRIMARY KEY (id)
);

CREATE TABLE public.uploads (
    image_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (image_id, user_id),
    CONSTRAINT uploads_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.images(id) ON DELETE CASCADE,
    CONSTRAINT uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX uploads_image_id_idx ON public.uploads(image_id);
CREATE INDEX uploads_user_id_idx ON public.uploads(user_id);

CREATE TABLE public.edits (
    id TEXT, 
    object_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    edit_type CHAR(3) NOT NULL,
  content TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
  CONSTRAINT edits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX edits_id_idx ON public.edits(id);
CREATE INDEX edits_object_id_idx ON public.edits(object_id);
CREATE INDEX edits_user_id_idx ON public.edits(user_id);
CREATE INDEX edits_edit_type_idx ON public.edits(edit_type);
CREATE INDEX edits_created_at_idx ON public.edits(created_at);

CREATE FUNCTION gen_edit_id(object_id TEXT, edit_type CHAR(3)) RETURNS TEXT AS $$ BEGIN RETURN edit_type || b64url(encode(sha256((object_id || now())::TEXT::bytea), 'base64'));  END; $$ LANGUAGE plpgsql; 

--- ITEM EDITS

CREATE FUNCTION create_item_edits() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'ITM'), NEW.id, NEW.updated_by, 'ITM', NEW.name, now());
    IF NEW.description IS NOT NULL THEN
      INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
      VALUES (gen_edit_id(NEW.id, 'DSC'), NEW.id, NEW.updated_by, 'DSC', NEW.description, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER create_item_edits_trigger AFTER INSERT ON public.items FOR EACH ROW EXECUTE FUNCTION create_item_edits();

CREATE FUNCTION edit_item_name() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'ITM'), NEW.id, NEW.updated_by, 'ITM', NEW.name, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER edit_item_name_trigger AFTER UPDATE ON public.items FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION edit_item_name();

CREATE FUNCTION edit_item_desc() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'DSC'), NEW.id, NEW.updated_by, 'DSC', NEW.description, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER edit_item_desc_trigger AFTER UPDATE ON public.items FOR EACH ROW WHEN (OLD.description IS DISTINCT FROM NEW.description) EXECUTE FUNCTION edit_item_desc();

CREATE FUNCTION edit_item_image() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'IMG'), NEW.id, NEW.updated_by, 'IMG', NEW.image, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER edit_item_image_trigger AFTER UPDATE ON public.items FOR EACH ROW WHEN (OLD.image IS DISTINCT FROM NEW.image) EXECUTE FUNCTION edit_item_image();


--- USER EDITS
CREATE FUNCTION create_user_edits() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'USR'), NEW.id, NEW.id, 'USR', NEW.name, now());
    IF NEW.bio IS NOT NULL THEN
      INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
      VALUES (gen_edit_id(NEW.id, 'BIO'), NEW.id, NEW.id, 'BIO', NEW.bio, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER create_user_edits_trigger AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION create_user_edits();

CREATE FUNCTION edit_user_name() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'USR'), NEW.id, NEW.id, 'USR', NEW.name, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER edit_user_name_trigger AFTER UPDATE ON public.users FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION edit_user_name();

CREATE FUNCTION edit_user_bio() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'BIO'), NEW.id, NEW.id, 'BIO', NEW.bio, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER edit_user_bio_trigger AFTER UPDATE ON public.users FOR EACH ROW WHEN (OLD.bio IS DISTINCT FROM NEW.bio) EXECUTE FUNCTION edit_user_bio();CREATE FUNCTION edit_item_image() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'IMG'), NEW.id, NEW.updated_by, 'IMG', NEW.image, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER edit_item_image_trigger AFTER UPDATE ON public.items FOR EACH ROW WHEN (OLD.image IS DISTINCT FROM NEW.image) EXECUTE FUNCTION edit_item_image();

CREATE FUNCTION edit_user_avatar() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.edits (id, object_id, user_id, edit_type, content, created_at)
    VALUES (gen_edit_id(NEW.id, 'PFP'), NEW.id, NEW.updated_by, 'PFP', NEW.avatar, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER edit_item_image_trigger AFTER UPDATE ON public.users FOR EACH ROW WHEN (OLD.avatar IS DISTINCT FROM NEW.avatar) EXECUTE FUNCTION edit_item_image();

