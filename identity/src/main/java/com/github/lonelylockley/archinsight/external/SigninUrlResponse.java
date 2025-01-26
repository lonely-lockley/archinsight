package com.github.lonelylockley.archinsight.external;

import java.util.Collections;
import java.util.List;

public class SigninUrlResponse {

    private List<UrlPerUser> member_signin_urls = Collections.emptyList();

    public List<UrlPerUser> getMember_signin_urls() {
        return member_signin_urls;
    }

    public void setMember_signin_urls(List<UrlPerUser> member_signin_urls) {
        this.member_signin_urls = member_signin_urls;
    }

    @Override
    public String toString() {
        return "SigninUrlResponse{" +
                "member_signin_urls=" + member_signin_urls +
                '}';
    }

    public static class UrlPerUser {
        private String member_id;
        private String url;

        public String getMember_id() {
            return member_id;
        }

        public void setMember_id(String member_id) {
            this.member_id = member_id;
        }

        public String getUrl() {
            return url;
        }

        public void setUrl(String url) {
            this.url = url;
        }

        @Override
        public String toString() {
            return "UrlPerUser{" +
                    "member_id='" + member_id + '\'' +
                    ", url='" + url + '\'' +
                    '}';
        }
    }
}
