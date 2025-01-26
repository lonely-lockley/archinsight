package com.github.lonelylockley.archinsight.external;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public class ExternalUserData {

    private List<ExternalUser> members = Collections.emptyList();

    public List<ExternalUser> getMembers() {
        return members;
    }

    public void setMembers(List<ExternalUser> members) {
        this.members = members;
    }

    @Override
    public String toString() {
        return "ExternalUserData{" +
                "members=" + members +
                '}';
    }

    public static class ExternalUser {
        private String id;
        private UUID uuid;
        private String email;
        private String name;
        private Instant created_at;
        private Instant updated_at;
        private Instant last_seen_at;
        private String avatar_image;
        private String status;
        private String image;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public UUID getUuid() {
            return uuid;
        }

        public void setUuid(UUID uuid) {
            this.uuid = uuid;
        }

        public String getEmail() {
            return email;
        }

        public void setEmail(String email) {
            this.email = email;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public Instant getCreated_at() {
            return created_at;
        }

        public void setCreated_at(Instant created_at) {
            this.created_at = created_at;
        }

        public Instant getUpdated_at() {
            return updated_at;
        }

        public void setUpdated_at(Instant updated_at) {
            this.updated_at = updated_at;
        }

        public Instant getLast_seen_at() {
            return last_seen_at;
        }

        public void setLast_seen_at(Instant last_seen_at) {
            this.last_seen_at = last_seen_at;
        }

        public String getAvatar_image() {
            return avatar_image;
        }

        public void setAvatar_image(String avatar_image) {
            this.avatar_image = avatar_image;
        }

        public String getImage() {
            return image;
        }

        public void setImage(String image) {
            this.image = image;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        @Override
        public String toString() {
            return "ExternalUser{" +
                    "id='" + id + '\'' +
                    ", uuid=" + uuid +
                    ", email='" + email + '\'' +
                    ", name='" + name + '\'' +
                    ", created_at=" + created_at +
                    ", updated_at=" + updated_at +
                    ", avatar_image='" + avatar_image + '\'' +
                    ", status='" + status + '\'' +
                    '}';
        }
    }
}
