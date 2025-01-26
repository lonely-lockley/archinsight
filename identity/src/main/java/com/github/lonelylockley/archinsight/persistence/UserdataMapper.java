package com.github.lonelylockley.archinsight.persistence;

import com.github.lonelylockley.archinsight.model.remote.identity.Userdata;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.UUID;

@Mapper()
public interface UserdataMapper {

    @Select("select * from public.userdata where id = #{id}")
    public Userdata getById(UUID id);

    @Select("select * from public.userdata where ssr_session = #{ssr}")
    public Userdata getBySsrSession(String ssr);

    @Select("select * from public.userdata where email = #{email}")
    public Userdata getByEmail(String email);

    @Insert("insert into userdata (id, avatar, display_name, email, email_verified, first_name, last_name, origin_id, \"source\", \"locale\") " +
            "values (#{id}, #{avatar}, #{displayName}, #{email}, #{emailVerified}, #{firstName}, #{lastName}, #{originId}, #{source}, #{locale})")
    public void createUserdata(Userdata data);

    @Select("select id from public.userdata where email = #{email}")
    public UUID getIdByEmail(String email);

    @Update("update public.userdata set ssr_session = #{ssr} where email = #{email}")
    public void storeSsrSession(String ssr, String email);

}
